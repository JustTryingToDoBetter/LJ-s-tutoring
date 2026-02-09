import { describe, it, expect, beforeEach, afterAll } from 'vitest';
import crypto from 'node:crypto';
import { buildApp } from '../src/app.js';
import { resetDb } from './helpers/db.js';
import { pool } from '../src/db/pool.js';

describe('Arcade API', () => {
  beforeEach(async () => {
    await resetDb();
  });

  afterAll(async () => {
    await pool.end();
  });

  it('creates a session and validates score', async () => {
    const app = await buildApp();

    const playerRes = await app.inject({
      method: 'POST',
      url: '/api/arcade/player',
      payload: {}
    });

    expect(playerRes.statusCode).toBe(201);
    const playerId = playerRes.json().player.id as string;

    const sessionRes = await app.inject({
      method: 'POST',
      url: '/api/arcade/session/start',
      payload: {
        playerId,
        gameId: 'quickmath',
        gameTitle: 'Quick Math'
      }
    });

    expect(sessionRes.statusCode).toBe(201);
    const session = sessionRes.json().session;

    const scoreRes = await app.inject({
      method: 'POST',
      url: '/api/arcade/score',
      payload: {
        playerId,
        gameId: 'quickmath',
        gameTitle: 'Quick Math',
        sessionId: session.id,
        sessionToken: session.token,
        score: 120,
        telemetry: { durationMs: 120000, eventCount: 100 }
      }
    });

    expect(scoreRes.statusCode).toBe(201);
    const scoreBody = scoreRes.json();
    expect(scoreBody.ok).toBe(true);
    expect(scoreBody.validation?.riskScore).toBeTypeOf('number');

    const leaderboardRes = await app.inject({
      method: 'GET',
      url: '/api/arcade/leaderboard/quickmath?limit=5'
    });

    expect(leaderboardRes.statusCode).toBe(200);
    const leaderboard = leaderboardRes.json();
    expect(leaderboard.gameId).toBe('quickmath');
    expect(leaderboard.entries.length).toBeGreaterThan(0);

    const endRes = await app.inject({
      method: 'POST',
      url: '/api/arcade/session/end',
      payload: {
        sessionId: session.id,
        reason: 'test'
      }
    });

    expect(endRes.statusCode).toBe(200);
    expect(endRes.json().ok).toBe(true);

    await app.close();
  });

  it('accepts telemetry events and dedupes by key', async () => {
    const app = await buildApp();

    const playerRes = await app.inject({
      method: 'POST',
      url: '/api/arcade/player',
      payload: {}
    });

    const playerId = playerRes.json().player.id as string;

    const sessionRes = await app.inject({
      method: 'POST',
      url: '/api/arcade/session/start',
      payload: {
        playerId,
        gameId: 'quickmath',
        gameTitle: 'Quick Math'
      }
    });

    const sessionId = sessionRes.json().session.id as string;

    const gameplayEvent = {
      eventId: crypto.randomUUID(),
      eventType: 'game_session_start',
      occurredAt: new Date().toISOString(),
      sessionId,
      userId: playerId,
      anonId: null,
      source: 'test',
      dedupeKey: crypto.randomUUID(),
      payload: { gameId: 'quickmath' }
    };

    const gameplayRes = await app.inject({
      method: 'POST',
      url: '/api/arcade/events/gameplay',
      payload: gameplayEvent
    });

    expect(gameplayRes.statusCode).toBe(200);
    expect(gameplayRes.json().ok).toBe(true);

    const adEvent = {
      eventId: crypto.randomUUID(),
      eventType: 'ad_impression',
      occurredAt: new Date().toISOString(),
      sessionId,
      userId: playerId,
      anonId: null,
      source: 'test',
      dedupeKey: crypto.randomUUID(),
      placement: 'menu_banner',
      provider: 'house',
      creativeId: 'house-default',
      variantId: 'control',
      payload: { sizeKb: 40, loadMs: 800 }
    };

    const adRes = await app.inject({
      method: 'POST',
      url: '/api/arcade/events/ad',
      payload: adEvent
    });

    expect(adRes.statusCode).toBe(200);
    expect(adRes.json().deduped).toBe(false);

    const adResDup = await app.inject({
      method: 'POST',
      url: '/api/arcade/events/ad',
      payload: adEvent
    });

    expect(adResDup.statusCode).toBe(200);
    expect(adResDup.json().deduped).toBe(true);

    const configRes = await app.inject({
      method: 'GET',
      url: '/api/arcade/ad-config'
    });

    expect(configRes.statusCode).toBe(200);
    expect(configRes.json().allowlist).toContain('house');

    await app.close();
  });
});
