import { loadRuntimeEnv, assertRuntimeEnv } from './lib/runtime-env.js';

loadRuntimeEnv();
assertRuntimeEnv();

const { buildApp } = await import('./app.js');
const { startRetentionScheduler } = await import('./lib/retention-scheduler.js');

const app = await buildApp();
const port = Number(process.env.PORT ?? 3001);
await app.listen({ port, host: '0.0.0.0' });

const scheduler = startRetentionScheduler(app.log);
for (const signal of ['SIGINT', 'SIGTERM']) {
  process.once(signal, () => scheduler.stop());
}
