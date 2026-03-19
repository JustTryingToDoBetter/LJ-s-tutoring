import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { requireAuth } from '../lib/rbac.js';
import { loadAssistantConfig } from '../domains/assistant/config.js';
import { createAssistantService } from '../domains/assistant/service.js';
import { createGroqProvider } from '../domains/assistant/providers/groq.js';
import { createOpenRouterProvider } from '../domains/assistant/providers/openrouter.js';

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

export async function assistantRoutes(app: FastifyInstance) {
  const config = loadAssistantConfig();
  const service = createAssistantService(
    config,
    [createGroqProvider(config.groqApiKey), createOpenRouterProvider(config.openRouterApiKey)],
    app.log.child({ module: 'assistant' }),
  );

  app.addHook('preHandler', app.authenticate);
  app.addHook('preHandler', requireAuth);

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
    }, 'assistant.document.completed');

    return reply.send({ text: result.text, metadata: result.metadata });
  });
}
