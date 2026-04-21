import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { loadAssistantConfig } from '../domains/assistant/config.js';
import { createAssistantService } from '../domains/assistant/service.js';
import { createOpenRouterProvider } from '../domains/assistant/providers/openrouter.js';
import { createLmStudioProvider } from '../domains/assistant/providers/lmstudio.js';

const HistoryMessageSchema = z.object({
  role: z.enum(['user', 'assistant']),
  content: z.string().trim().min(1).max(4000),
});

const ChatSchema = z.object({
  message: z.string().trim().min(1).max(20000),
  history: z.array(HistoryMessageSchema).max(24).optional().default([]),
  personaVariant: z.string().trim().min(1).max(80).optional(),
  systemPrompt: z.string().trim().min(1).max(4000).optional(),
});

const DocumentSchema = z.object({
  documentText: z.string().trim().min(1).max(500000),
  userQuestion: z.string().trim().min(1).max(20000),
  history: z.array(HistoryMessageSchema).max(24).optional().default([]),
  personaVariant: z.string().trim().min(1).max(80).optional(),
  systemPrompt: z.string().trim().min(1).max(4000).optional(),
});

function setPrivateNoStore(reply: any) {
  reply.header('Cache-Control', 'private, no-store, max-age=0');
  reply.header('Pragma', 'no-cache');
}

export function isAssistantEnabled(env: NodeJS.ProcessEnv = process.env) {
  const raw = String(env.ASSISTANT_ENABLED ?? 'true').trim().toLowerCase();
  if (!raw) return true;
  return raw !== 'false' && raw !== '0' && raw !== 'off' && raw !== 'disabled';
}

function parseAccessKeys(env: NodeJS.ProcessEnv) {
  const csvKeys = String(env.ODIE_ACCESS_KEYS || '')
    .split(',')
    .map((value) => value.trim())
    .filter(Boolean);
  const single = String(env.ODIE_ACCESS_KEY || '').trim();
  const all = single ? [...csvKeys, single] : csvKeys;
  return new Set(all);
}

function getAccessKeyFromRequest(req: any) {
  const header = req.headers?.['x-odie-access-key'];
  const keyHeader = Array.isArray(header) ? header[0] : header;
  if (keyHeader && String(keyHeader).trim()) {
    return String(keyHeader).trim();
  }

  const authHeader = req.headers?.authorization;
  const authValue = Array.isArray(authHeader) ? authHeader[0] : authHeader;
  if (authValue && /^Bearer\s+/i.test(authValue)) {
    return authValue.replace(/^Bearer\s+/i, '').trim();
  }

  return '';
}

const ALLOWED_ROLES = new Set(['STUDENT', 'TUTOR', 'ADMIN']);

export async function assistantRoutes(app: FastifyInstance) {
  const assistantEnabled = isAssistantEnabled(process.env);
  const config = loadAssistantConfig();
  const accessKeys = parseAccessKeys(process.env);
  // In production, a session cookie is the primary credential. The access-key
  // header is only honoured when `ODIE_ALLOW_ACCESS_KEY_FALLBACK=true` (e.g.
  // for a public landing-page preview). Dev can bypass via ODIE_DEV_NO_AUTH.
  const allowAccessKeyFallback = String(process.env.ODIE_ALLOW_ACCESS_KEY_FALLBACK || '').toLowerCase() === 'true';
  const devBypass = process.env.NODE_ENV !== 'production' && String(process.env.ODIE_DEV_NO_AUTH || '').toLowerCase() === 'true';

  // Disabled short-circuit: register handlers that always return a safe disabled response.
  if (!assistantEnabled) {
    const disabledHandler = async (_req: any, reply: any) => {
      setPrivateNoStore(reply);
      return reply.code(503).send({ error: 'assistant_disabled' });
    };
    app.get('/assistant/status', async (_req, reply) => {
      setPrivateNoStore(reply);
      return reply.send({ enabled: false });
    });
    app.post('/assistant/chat', disabledHandler);
    app.post('/assistant/document', disabledHandler);
    app.log.warn({ event: 'assistant.disabled' }, 'assistant.disabled');
    return;
  }

  const service = createAssistantService(
    config,
    [
      createLmStudioProvider(config.lmStudioBaseUrl, config.lmStudioModel),
      createOpenRouterProvider(config.openRouterApiKey),
    ],
    app.log.child({ module: 'assistant' }),
  );

  app.get('/assistant/status', async (_req, reply) => {
    setPrivateNoStore(reply);
    return reply.send({ enabled: true });
  });

  app.addHook('preHandler', async (req: any, reply) => {
    // Status endpoint stays publicly available so the UI can hide entry points.
    if (req.routeOptions?.url === '/assistant/status') return;

    if (devBypass) return;

    // Primary path: an authenticated session with a recognised role.
    // We avoid calling app.authenticate when there is no session cookie, so we
    // don't short-circuit with a 401 before we can try the access-key fallback.
    const sessionCookie = req.cookies?.session;
    if (sessionCookie) {
      try {
        const decoded: any = await (app as any).jwt.verify(sessionCookie);
        if (decoded?.role && ALLOWED_ROLES.has(decoded.role)) {
          req.user = {
            userId: decoded.userId,
            role: decoded.role,
            tutorId: decoded.tutorId,
            studentId: decoded.studentId,
          };
          return;
        }
      } catch {
        // bad/expired JWT – fall through to access-key fallback check.
      }
    }

    if (!allowAccessKeyFallback) {
      return reply.code(401).send({ error: 'assistant_auth_required' });
    }

    if (accessKeys.size === 0) {
      req.log.error({ event: 'assistant.access_key.not_configured' }, 'assistant.access_key.not_configured');
      return reply.code(503).send({ error: 'assistant_access_keys_not_configured' });
    }

    const provided = getAccessKeyFromRequest(req);
    if (!provided) {
      return reply.code(401).send({ error: 'assistant_access_key_required' });
    }

    if (!accessKeys.has(provided)) {
      return reply.code(403).send({ error: 'assistant_access_key_invalid' });
    }
  });

  app.post('/assistant/chat', async (req, reply) => {
    setPrivateNoStore(reply);
    const parsed = ChatSchema.safeParse(req.body);
    if (!parsed.success) {
      return reply.code(400).send({ error: 'invalid_request', details: parsed.error.flatten() });
    }

    const result = await service.chat({
      message: parsed.data.message,
      history: parsed.data.history,
      personaVariant: parsed.data.personaVariant,
      systemPrompt: parsed.data.systemPrompt,
      requestId: req.id,
    });

    req.log.info({
      event: 'assistant.chat.completed',
      provider: result.metadata.provider,
      model: result.metadata.model,
      fallbackUsed: result.metadata.fallbackUsed,
      requestId: req.id,
      userId: (req as any).user?.userId,
      role: (req as any).user?.role,
    }, 'assistant.chat.completed');

    return reply.send({ text: result.text, metadata: result.metadata });
  });

  app.post('/assistant/document', async (req, reply) => {
    setPrivateNoStore(reply);
    const parsed = DocumentSchema.safeParse(req.body);
    if (!parsed.success) {
      return reply.code(400).send({ error: 'invalid_request', details: parsed.error.flatten() });
    }

    const result = await service.analyzeDocument({
      documentText: parsed.data.documentText,
      userQuestion: parsed.data.userQuestion,
      history: parsed.data.history,
      personaVariant: parsed.data.personaVariant,
      systemPrompt: parsed.data.systemPrompt,
      requestId: req.id,
    });

    req.log.info({
      event: 'assistant.document.completed',
      provider: result.metadata.provider,
      model: result.metadata.model,
      fallbackUsed: result.metadata.fallbackUsed,
      documentChunksUsed: result.metadata.documentChunksUsed,
      requestId: req.id,
      userId: (req as any).user?.userId,
      role: (req as any).user?.role,
    }, 'assistant.document.completed');

    return reply.send({ text: result.text, metadata: result.metadata });
  });
}
