type ScoreValidationInput = {
  session: {
    id: string;
    player_id: string;
    game_id: string;
    started_at: Date;
    ended_at: Date | null;
  };
  payload: {
    score: number;
  };
  telemetry?: {
    runSeed?: string;
    durationMs?: number;
    eventCount?: number;
    events?: Array<{ type: string }>; 
  };
};

type ScoreValidationResult = {
  valid: boolean;
  reason?: string;
  risk_score: number;
  signals: string[];
};

type GameRule = {
  maxScorePerMinute: number;
  maxScoreAbsolute: number;
  minDurationMs: number;
};

const DEFAULT_RULE: GameRule = {
  maxScorePerMinute: 600,
  maxScoreAbsolute: 1000000,
  minDurationMs: 3000,
};

const GAME_RULES: Record<string, GameRule> = {
  quickmath: { maxScorePerMinute: 240, maxScoreAbsolute: 20000, minDurationMs: 5000 },
  snake: { maxScorePerMinute: 120, maxScoreAbsolute: 5000, minDurationMs: 8000 },
  pong: { maxScorePerMinute: 60, maxScoreAbsolute: 500, minDurationMs: 5000 },
  invaders: { maxScorePerMinute: 900, maxScoreAbsolute: 150000, minDurationMs: 8000 },
  asteroids: { maxScorePerMinute: 900, maxScoreAbsolute: 150000, minDurationMs: 8000 },
  hangman: { maxScorePerMinute: 120, maxScoreAbsolute: 5000, minDurationMs: 4000 },
  wordle: { maxScorePerMinute: 60, maxScoreAbsolute: 5000, minDurationMs: 8000 },
  sudoku: { maxScorePerMinute: 120, maxScoreAbsolute: 50000, minDurationMs: 12000 },
  tictactoe: { maxScorePerMinute: 60, maxScoreAbsolute: 10000, minDurationMs: 4000 },
  chess: { maxScorePerMinute: 60, maxScoreAbsolute: 10000, minDurationMs: 5000 },
  "2048": { maxScorePerMinute: 1200, maxScoreAbsolute: 200000, minDurationMs: 8000 },
  minesweeper: { maxScorePerMinute: 240, maxScoreAbsolute: 50000, minDurationMs: 8000 },
};

function resolveRule(gameId: string) {
  return GAME_RULES[gameId] ?? DEFAULT_RULE;
}

export function summarizeTelemetry(telemetry?: ScoreValidationInput['telemetry']) {
  if (!telemetry) return null;
  return {
    runSeed: telemetry.runSeed ?? null,
    durationMs: telemetry.durationMs ?? null,
    eventCount: telemetry.eventCount ?? telemetry.events?.length ?? null,
  };
}

export function validateScore({ session, payload, telemetry }: ScoreValidationInput): ScoreValidationResult {
  const rule = resolveRule(session.game_id);
  const now = Date.now();
  const startedAt = session.started_at.getTime();
  const endedAt = session.ended_at?.getTime() ?? now;
  const durationMs = Math.max(0, telemetry?.durationMs ?? endedAt - startedAt);
  const durationMinutes = Math.max(durationMs / 60000, 0.01);

  const signals: string[] = [];
  let risk = 0;

  if (durationMs < rule.minDurationMs) {
    risk += 20;
    signals.push('duration_too_short');
  }

  if (payload.score > rule.maxScoreAbsolute) {
    risk += 80;
    signals.push('score_above_absolute');
  }

  const maxByTime = rule.maxScorePerMinute * durationMinutes;
  if (payload.score > maxByTime * 1.1) {
    risk += 50;
    signals.push('score_above_rate');
  }

  if (!Number.isFinite(payload.score) || payload.score < 0) {
    risk += 100;
    signals.push('score_invalid');
  }

  const valid = risk < 60 && !signals.includes('score_invalid') && !signals.includes('score_above_absolute');
  const reason = signals[0] ?? null;

  return {
    valid,
    reason: reason ?? undefined,
    risk_score: Math.min(risk, 100),
    signals,
  };
}
