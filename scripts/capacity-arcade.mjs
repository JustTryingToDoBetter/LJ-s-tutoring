import 'dotenv/config';
import crypto from 'node:crypto';

const API_BASE = process.env.API_BASE_URL || process.env.PO_API_BASE || 'http://localhost:3001';
const CONCURRENCY = Number(process.env.CAPACITY_CONCURRENCY || 50);
const SESSIONS = Number(process.env.CAPACITY_SESSIONS || 200);
const AD_EVENTS = Number(process.env.CAPACITY_AD_EVENTS || 3);
const GAME_ID = process.env.CAPACITY_GAME_ID || 'quickmath';

const stats = {
  started: 0,
  failed: 0,
  durations: [],
};

async function apiPost(path, payload) {
  const res = await fetch(`${API_BASE}/api/arcade${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload || {}),
  });
  if (!res.ok) throw new Error(`${res.status}`);
  return res.json();
}

async function runSession(index) {
  const start = Date.now();
  try {
    const player = await apiPost('/player', {});
    const playerId = player?.player?.id;
    const session = await apiPost('/session/start', {
      playerId,
      gameId: GAME_ID,
      gameTitle: GAME_ID,
      clientFingerprint: `cap-${index}`,
    });

    const sessionId = session?.session?.id;
    const token = session?.session?.token;

    for (let i = 0; i < AD_EVENTS; i += 1) {
      await apiPost('/events/ad', {
        eventId: crypto.randomUUID(),
        eventType: 'ad_impression',
        occurredAt: new Date().toISOString(),
        sessionId,
        userId: playerId,
        anonId: null,
        source: 'capacity',
        dedupeKey: crypto.randomUUID(),
        placement: 'menu_banner',
        provider: 'house',
        creativeId: 'house-default',
        variantId: 'control',
        payload: { sizeKb: 40, loadMs: 800 },
      });
    }

    await apiPost('/events/gameplay', {
      eventId: crypto.randomUUID(),
      eventType: 'game_session_start',
      occurredAt: new Date().toISOString(),
      sessionId,
      userId: playerId,
      anonId: null,
      source: 'capacity',
      dedupeKey: crypto.randomUUID(),
      payload: { gameId: GAME_ID },
    });

    await apiPost('/score', {
      playerId,
      gameId: GAME_ID,
      gameTitle: GAME_ID,
      sessionId,
      sessionToken: token,
      score: Math.floor(Math.random() * 5000),
      telemetry: { durationMs: 120000, eventCount: 200 },
    });

    await apiPost('/session/end', { sessionId, reason: 'capacity' });

    stats.started += 1;
  } catch {
    stats.failed += 1;
  } finally {
    stats.durations.push(Date.now() - start);
  }
}

async function run() {
  let idx = 0;

  const start = Date.now();

  const workers = Array.from({ length: CONCURRENCY }, async () => {
    while (idx < SESSIONS) {
      const current = idx;
      idx += 1;
      await runSession(current);
    }
  });

  await Promise.all(workers);

  const total = Date.now() - start;
  const avg = stats.durations.reduce((a, b) => a + b, 0) / Math.max(stats.durations.length, 1);

  console.log('[capacity] sessions', stats.started, 'failed', stats.failed);
  console.log('[capacity] avg_ms', Math.round(avg), 'total_ms', total);
}

run().catch((err) => {
  console.error('[capacity] failed', err);
  process.exitCode = 1;
});
