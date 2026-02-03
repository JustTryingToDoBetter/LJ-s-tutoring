/**
 * storage.js
 * Local-only persistence with versioning and guardrails.
 * Keeps data small + predictable for production use.
 */

const KEY = "po_arcade_v1";
const LEGACY_KEY = "po_arcade_state_v1";

export function loadState() {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return migrateLegacy(freshState());
    const parsed = JSON.parse(raw);

    // Minimal schema validation (avoid breaking on corrupt storage)
    if (!parsed || typeof parsed !== "object") return migrateLegacy(freshState());
    return migrateLegacy({ ...freshState(), ...parsed });
  } catch {
    return migrateLegacy(freshState());
  }
}

export function saveState(state) {
  // Keep payload lean: store only what you need.
  const safe = {
    version: 1,
    profile: state.profile,
    games: state.games,
    daily: state.daily,
  };
  localStorage.setItem(KEY, JSON.stringify(safe));
}

export function resetState() {
  localStorage.removeItem(KEY);
}

function freshState() {
  return {
    version: 1,
    profile: {
      streak: 0,
      completed: 0,
      lastDailyKey: null,
      theme: "light",
    },
    daily: {
      // Tracks completion flags per day key.
      history: {},
    },
    games: {
      // quickmath schema:
      // - best: number (all-time)
      // - dailyBest: { dayKey: "YYYY-MM-DD", score: number } | null
      // - plays: number
      // - lastPlayed: timestamp
      // - last: { score, streak, answered, at }
      quickmath: { best: 0, dailyBest: null, plays: 0, lastPlayed: null, last: null },
      wordle: { wins: 0, plays: 0, lastKey: null, lastGrid: null },
      sudoku: { saves: {} },
      tictactoe: { winsX: 0, winsO: 0, draws: 0 },
      hangman: { wins: 0, losses: 0 },
      chess: { winsW: 0, winsB: 0, draws: 0, last: null },
    },
  };
}

function migrateLegacy(state) {
  try {
    const raw = localStorage.getItem(LEGACY_KEY);
    if (!raw) return state;
    const legacy = JSON.parse(raw);
    const legacyQuickmath = legacy?.games?.quickmath;
    if (legacyQuickmath && state?.games?.quickmath) {
      state.games.quickmath.best = Number.isFinite(legacyQuickmath.best)
        ? legacyQuickmath.best
        : state.games.quickmath.best;
      state.games.quickmath.dailyBest = legacyQuickmath.dailyBest || state.games.quickmath.dailyBest;
      state.games.quickmath.last = legacyQuickmath.last || state.games.quickmath.last;
    }
    return state;
  } catch {
    return state;
  }
}
