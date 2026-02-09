import { describe, it, expect } from 'vitest';
import { signArcadeSessionToken, verifyArcadeSessionToken } from '../src/lib/arcade-tokens.js';
import { validateScore } from '../src/domains/arcade/score-validation.js';

describe('arcade session tokens', () => {
  it('signs and verifies tokens', () => {
    const secret = 'test-secret';
    const token = signArcadeSessionToken({
      sessionId: 'session-1',
      playerId: 'player-1',
      gameId: 'quickmath',
      issuedAt: new Date().toISOString(),
      expiresAt: new Date(Date.now() + 60_000).toISOString(),
      nonce: 'nonce-1',
      clientFingerprintHash: 'hash',
    }, secret);

    const decoded = verifyArcadeSessionToken(token, secret);
    expect(decoded?.sessionId).toBe('session-1');
    expect(decoded?.playerId).toBe('player-1');
    expect(decoded?.gameId).toBe('quickmath');
  });

  it('rejects tampered tokens', () => {
    const secret = 'test-secret';
    const token = signArcadeSessionToken({
      sessionId: 'session-1',
      playerId: 'player-1',
      gameId: 'quickmath',
      issuedAt: new Date().toISOString(),
      expiresAt: new Date(Date.now() + 60_000).toISOString(),
      nonce: 'nonce-1',
    }, secret);

    const bad = token.replace('a', 'b');
    const decoded = verifyArcadeSessionToken(bad, secret);
    expect(decoded).toBeNull();
  });
});

describe('arcade score validation', () => {
  it('flags scores above absolute max', () => {
    const result = validateScore({
      session: {
        id: 's1',
        player_id: 'p1',
        game_id: 'quickmath',
        started_at: new Date(Date.now() - 60_000),
        ended_at: null,
      },
      payload: { score: 9999999 },
    });

    expect(result.valid).toBe(false);
    expect(result.signals).toContain('score_above_absolute');
  });

  it('accepts reasonable scores', () => {
    const result = validateScore({
      session: {
        id: 's1',
        player_id: 'p1',
        game_id: 'quickmath',
        started_at: new Date(Date.now() - 120_000),
        ended_at: null,
      },
      payload: { score: 120 },
    });

    expect(result.valid).toBe(true);
  });
});
