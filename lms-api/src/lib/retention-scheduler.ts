import { pool } from '../db/pool.js';
import { runRetentionCleanup } from './retention-cleanup.js';
import { getErrorMonitor } from './error-monitor.js';

const DEFAULT_INTERVAL_MS = 24 * 60 * 60 * 1000; // 24 hours

function getIntervalMs(): number {
  const value = Number(process.env.RETENTION_INTERVAL_MS ?? '');
  return Number.isFinite(value) && value > 0 ? value : DEFAULT_INTERVAL_MS;
}

async function runOnce(log: { info: (msg: string, obj?: any) => void; error: (msg: string, obj?: any) => void }) {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const result = await runRetentionCleanup(client);
    await client.query('COMMIT');
    log.info('Retention cleanup completed', { summary: result.summary, eventId: result.event.id });
    return result;
  } catch (err: any) {
    await client.query('ROLLBACK').catch(() => {});
    getErrorMonitor().captureException(err);
    log.error('Retention cleanup failed', { err: err?.message });
  } finally {
    client.release();
  }
}

export function startRetentionScheduler(log: { info: (msg: string, obj?: any) => void; error: (msg: string, obj?: any) => void }) {
  if (process.env.RETENTION_SCHEDULER_ENABLED !== 'true') {
    log.info('Retention scheduler disabled (RETENTION_SCHEDULER_ENABLED != true)');
    return { stop: () => {} };
  }

  const intervalMs = getIntervalMs();
  log.info(`Retention scheduler started (interval: ${intervalMs}ms)`);

  // Run once shortly after startup, then on the configured interval
  const startupDelay = Number(process.env.RETENTION_STARTUP_DELAY_MS ?? 60_000);
  let timer: ReturnType<typeof setTimeout> | null = null;
  let interval: ReturnType<typeof setInterval> | null = null;

  timer = setTimeout(async () => {
    await runOnce(log);
    interval = setInterval(() => runOnce(log), intervalMs);
  }, startupDelay);

  return {
    stop() {
      if (timer) clearTimeout(timer);
      if (interval) clearInterval(interval);
    }
  };
}
