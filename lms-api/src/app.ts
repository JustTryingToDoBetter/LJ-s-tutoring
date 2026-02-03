import Fastify from 'fastify';
import helmet from '@fastify/helmet';
import cors from '@fastify/cors';
import rateLimit from '@fastify/rate-limit';

import './types.js';
import { authPlugin } from './plugins/auth.js';
import { authRoutes } from './routes/auth.js';
import { adminRoutes } from './routes/admin.js';
import { tutorRoutes } from './routes/tutor.js';

export async function buildApp() {
  const app = Fastify({
    logger: false,
    trustProxy: Number(process.env.TRUST_PROXY ?? 1),
    bodyLimit: 256 * 1024
  });

  await app.register(helmet, { contentSecurityPolicy: false });
  await app.register(cors, {
    origin: (process.env.CORS_ORIGIN ?? '')
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean),
    credentials: false
  });
  await app.register(rateLimit, { max: 120, timeWindow: '1 minute' });

  await app.register(authPlugin);

  app.get('/health', async () => ({ ok: true }));

  await app.register(authRoutes);
  await app.register(adminRoutes);
  await app.register(tutorRoutes);

  return app;
}
