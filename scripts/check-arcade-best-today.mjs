import { dayKey } from "../assets/lib/rng.js";

const today = dayKey(new Date(2026, 1, 3)); // Feb 3, 2026 (local)

function getBestTodayScore(state, key) {
  const daily = state?.games?.quickmath?.dailyBest;
  if (!daily || daily.dayKey !== key) return "—";
  return typeof daily.score === "number" ? String(daily.score) : "—";
}

const state = {
  games: {
    quickmath: {
      best: 120,
      dailyBest: { dayKey: today, score: 42 },
      last: { score: 42, streak: 3, answered: 10, at: 0 },
    },
  },
};

const best = getBestTodayScore(state, today);
if (best !== "42") {
  throw new Error(`Expected best today to be 42, got ${best}`);
}

console.log("OK: best-today stat schema is consistent.");
