import Fastify from 'fastify';
import helmet from '@fastify/helmet';
import cors from '@fastify/cors';
import rateLimit from '@fastify/rate-limit';
import cookie from '@fastify/cookie';

import './types.js';
import { authPlugin } from './plugins/auth.js';
import { generateCsrfToken, generateRequestId } from './lib/security.js';
import { pool } from './db/pool.js';
import { safeAuditMeta, writeAuditLog } from './lib/audit.js';
import { authRoutes } from './routes/auth.js';
import { adminRoutes } from './routes/admin.js';
import { tutorRoutes } from './routes/tutor.js';

export async function buildApp() {
  const app = Fastify({
    logger: true,
    trustProxy: Number(process.env.TRUST_PROXY ?? 1),
    bodyLimit: 256 * 1024
  });

  const csrfCookieOptions = () => {
    const isProd = process.env.NODE_ENV === 'production';
    return {
      httpOnly: false,
      sameSite: 'lax' as const,
      secure: isProd,
      path: '/',
      maxAge: 60 * 60 * 24 * 7
    };
  };

  await app.register(helmet, { contentSecurityPolicy: false });
  await app.register(cookie, {
    secret: process.env.COOKIE_SECRET,
    hook: 'onRequest'
  });
  const allowedOrigins = (process.env.CORS_ORIGIN ?? '')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);

  await app.register(cors, {
    origin: (origin, cb) => {
      if (!origin) return cb(null, false);
      const allowed = allowedOrigins.includes(origin);
      return cb(null, allowed);
    },
    credentials: true,
    allowedHeaders: ['Content-Type', 'X-CSRF-Token'],
    methods: ['GET', 'POST', 'PATCH', 'DELETE']
  });
  await app.register(rateLimit, { max: 120, timeWindow: '1 minute' });

  app.addHook('onRequest', async (req, reply) => {
    const incoming = req.headers['x-request-id'];
    const value = Array.isArray(incoming) ? incoming[0] : incoming;
    const requestId = value || generateRequestId();
    req.id = requestId;
    reply.header('X-Request-Id', requestId);
  });

  app.addHook('onRequest', async (_req, reply) => {
    reply.header('X-Content-Type-Options', 'nosniff');
    reply.header('Referrer-Policy', 'strict-origin-when-cross-origin');
    reply.header('Permissions-Policy', 'accelerometer=(), camera=(), geolocation=(), gyroscope=(), magnetometer=(), microphone=(), payment=(), usb=()');
    reply.header('X-Frame-Options', 'DENY');
  });

  app.addHook('preHandler', async (req, reply) => {
    const sessionToken = req.cookies?.session;
    if (!sessionToken) return;

    const existingCsrf = req.cookies?.csrf;
    const csrfToken = existingCsrf ?? generateCsrfToken();
    if (!existingCsrf) {
      reply.setCookie('csrf', csrfToken, csrfCookieOptions());
    }

    if (!['POST', 'PATCH', 'DELETE'].includes(req.method)) return;

    const header = req.headers['x-csrf-token'];
    const headerValue = Array.isArray(header) ? header[0] : header;
    if (!headerValue || headerValue !== csrfToken) {
      return reply.code(403).send({ error: 'csrf_missing_or_invalid' });
    }
  });

  await app.register(authPlugin);

  app.addHook('preHandler', async (req, reply) => {
    if (!req.impersonation) return;
    if (['POST', 'PATCH', 'DELETE'].includes(req.method)) {
      return reply.code(403).send({ error: 'impersonation_read_only' });
    }
  });

  app.addHook('onResponse', async (req, reply) => {
    if (!req.impersonation) return;
    if (req.method !== 'GET') return;
    try {
      await writeAuditLog(pool, {
        actorUserId: req.impersonation.adminUserId,
        actorRole: 'ADMIN',
        action: 'impersonation.read',
        entityType: 'http_request',
        entityId: req.routeOptions?.url ?? req.url,
        meta: safeAuditMeta({
          method: req.method,
          path: req.url,
          statusCode: reply.statusCode,
          tutorId: req.impersonation.tutorId,
          impersonationId: req.impersonation.impersonationId,
        }),
        ip: req.ip,
        userAgent: req.headers['user-agent'] as string | undefined,
        correlationId: req.id,
      });
    } catch {
      req.log?.error?.('Failed to write impersonation audit log');
    }
  });

  app.get('/health', async () => ({ ok: true }));

  await app.register(authRoutes);
  await app.register(adminRoutes);
  await app.register(tutorRoutes);

  return app;
}
