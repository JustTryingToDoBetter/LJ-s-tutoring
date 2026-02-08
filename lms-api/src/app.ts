import Fastify from 'fastify';
import helmet from '@fastify/helmet';
import cors from '@fastify/cors';
import rateLimit from '@fastify/rate-limit';
import cookie from '@fastify/cookie';
import fs from 'node:fs';
import path from 'node:path';

import './types.js';
import { authPlugin } from './plugins/auth.js';
import { generateCsrfToken, generateRequestId } from './lib/security.js';
import { pool } from './db/pool.js';
import { safeAuditMeta, writeAuditLog } from './lib/audit.js';
import { initErrorMonitor } from './lib/error-monitor.js';
import { authRoutes } from './routes/auth.js';
import { adminRoutes } from './routes/admin.js';
import { tutorRoutes } from './routes/tutor.js';
import { arcadeRoutes } from './routes/arcade.js';

export async function buildApp() {
  const logger = process.env.NODE_ENV === 'test'
    ? { level: process.env.LOG_LEVEL ?? 'info', stream: process.stdout }
    : true;

  const app = Fastify({
    logger,
    trustProxy: Number(process.env.TRUST_PROXY ?? 1),
    bodyLimit: 256 * 1024
  });

  const errorMonitor = await initErrorMonitor();
  const slowRequestMs = Number(process.env.SLOW_REQUEST_MS ?? 500);

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
    allowedHeaders: ['Content-Type', 'X-CSRF-Token', 'X-Request-Id', 'X-Impersonation-Token'],
    methods: ['GET', 'POST', 'PATCH', 'DELETE']
  });
  await app.register(rateLimit, { max: 120, timeWindow: '1 minute' });

  app.addHook('onRequest', async (req, reply) => {
    const incoming = req.headers['x-request-id'];
    const value = Array.isArray(incoming) ? incoming[0] : incoming;
    const requestId = value || generateRequestId();
    req.requestStart = Date.now();
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

  app.addHook('onResponse', async (req, reply) => {
    const durationMs = req.requestStart ? Date.now() - req.requestStart : undefined;
    const logPayload = {
      method: req.method,
      path: req.routeOptions?.url ?? req.url,
      statusCode: reply.statusCode,
      durationMs,
      userId: req.user?.userId,
      role: req.user?.role,
      impersonation: Boolean(req.impersonation),
      correlationId: req.id,
    };

    if (durationMs != null && durationMs >= slowRequestMs) {
      req.log?.warn?.(logPayload, 'request.slow');
    } else {
      req.log?.info?.(logPayload, 'request.complete');
    }
  });

  app.setErrorHandler((err: any, req, reply) => {
    errorMonitor.captureException(err, {
      correlationId: req.id,
      userId: req.user?.userId,
      role: req.user?.role,
      path: req.routeOptions?.url ?? req.url,
      method: req.method,
    });

    req.log?.error?.(err);
    const statusCode = err.statusCode && Number.isInteger(err.statusCode) ? err.statusCode : 500;
    if (statusCode >= 500) {
      reply.code(statusCode).send({ error: 'internal_error' });
      return;
    }
    const safeCode = err.code || 'bad_request';
    reply.code(statusCode).send({ error: safeCode });
  });

  process.on('unhandledRejection', (reason) => {
    errorMonitor.captureException(reason);
    app.log?.error?.(reason as any, 'unhandledRejection');
  });

  process.on('uncaughtException', (err) => {
    errorMonitor.captureException(err);
    app.log?.error?.(err, 'uncaughtException');
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

  app.get('/health', async (_req, reply) => {
    const start = Date.now();
    try {
      await pool.query('select 1');
      return reply.send({ ok: true, db: { ok: true, latencyMs: Date.now() - start } });
    } catch {
      return reply.code(503).send({ ok: false, db: { ok: false, latencyMs: Date.now() - start } });
    }
  });

  app.get('/ready', async (_req, reply) => {
    const start = Date.now();
    let dbOk = false;
    let migrationsOk = false;

    try {
      await pool.query('select 1');
      dbOk = true;
    } catch {
      dbOk = false;
    }

    try {
      const migrationsDir = path.resolve(process.cwd(), 'prisma/migrations');
      const folders = fs.existsSync(migrationsDir)
        ? fs.readdirSync(migrationsDir, { withFileTypes: true })
            .filter((entry) => entry.isDirectory())
            .map((entry) => entry.name)
        : [];

      if (folders.length === 0) {
        migrationsOk = true;
      } else {
        const res = await pool.query('select id from schema_migrations');
        const applied = new Set(res.rows.map((row) => row.id));
        migrationsOk = folders.every((folder) => applied.has(folder));
      }
    } catch {
      migrationsOk = false;
    }

    const ok = dbOk && migrationsOk;
    const payload = {
      ok,
      db: { ok: dbOk, latencyMs: Date.now() - start },
      migrations: { ok: migrationsOk }
    };
    if (!ok) return reply.code(503).send(payload);
    return reply.send(payload);
  });

  if (process.env.NODE_ENV !== 'production') {
    app.get('/__test/error', async () => {
      throw new Error('test_error');
    });
  }

  await app.register(authRoutes);
  await app.register(adminRoutes);
  await app.register(tutorRoutes);
  await app.register(arcadeRoutes, { prefix: '/arcade' });
  await app.register(arcadeRoutes, { prefix: '/api/arcade' });

  return app;
}
