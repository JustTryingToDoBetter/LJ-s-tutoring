import 'dotenv/config';
import Fastify from 'fastify';
import helmet from '@fastify/helmet';
import cors from '@fastify/cors';
import rateLimit from '@fastify/rate-limit';
import { buildApp } from './app.js';

import './types.js';
import { authPlugin } from './plugins/auth.js';
import { authRoutes } from './routes/auth.js';
import { adminRoutes } from './routes/admin.js';
import { tutorRoutes } from './routes/tutor.js';
import { tutorSessionMutationRoutes } from './routes/tutor-session-mutations.js';

const app = await buildApp();
const port = Number(process.env.PORT ?? 3001);
await app.listen({ port, host: '0.0.0.0' });



await app.register(helmet, {
  contentSecurityPolicy: false,
  crossOriginResourcePolicy: { policy: "same-site" }
});

await app.register(cors, {
  origin: (process.env.CORS_ORIGIN ?? '')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean),
  credentials: false
});

// Global rate-limit (baseline)
await app.register(rateLimit, { max: 120, timeWindow: '1 minute' });

await app.register(authPlugin);

app.get('/health', async () => ({ ok: true }));

await app.register(authRoutes);
await app.register(adminRoutes);
await app.register(tutorRoutes);
await app.register(tutorSessionMutationRoutes);


const port = Number(process.env.PORT ?? 3001);
await app.listen({ port, host: '0.0.0.0' });
