import { describe, expect, it } from 'vitest';
import { computeScoreSnapshot } from '../src/lib/predictive-scoring.js';

describe('Predictive scoring engine', () => {
  it('produces deterministic high-risk output for low activity input', () => {
    const result = computeScoreSnapshot({
      approvedSessions14: 1,
      rejectedSessions14: 3,
      streakCurrent: 0,
      streakBreaks14: 3,
      practiceEvents7: 1,
      practiceMinutes7: 20,
      topicTrendDelta: -0.4,
      vaultEvents7: 0,
      assistantEvents7: 0,
      previousRiskScore: 72,
      previousMomentumScore: 28,
    });

    expect(result.riskScore).toBeGreaterThanOrEqual(70);
    expect(result.momentumScore).toBeLessThanOrEqual(40);
    expect(result.reasons.some((reason) => reason.key === 'attendance')).toBe(true);
    expect(result.reasons.some((reason) => reason.key === 'practice')).toBe(true);
  });

  it('produces deterministic momentum output for strong consistency input', () => {
    const result = computeScoreSnapshot({
      approvedSessions14: 5,
      rejectedSessions14: 0,
      streakCurrent: 8,
      streakBreaks14: 0,
      practiceEvents7: 6,
      practiceMinutes7: 220,
      topicTrendDelta: 0.2,
      vaultEvents7: 3,
      assistantEvents7: 2,
      previousRiskScore: 35,
      previousMomentumScore: 62,
    });

    expect(result.riskScore).toBeLessThanOrEqual(35);
    expect(result.momentumScore).toBeGreaterThanOrEqual(65);
    expect(result.reasons.some((reason) => reason.key === 'momentum_positive')).toBe(true);
  });
});
