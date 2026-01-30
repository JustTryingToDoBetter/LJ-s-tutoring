/**
 * storage.js
 * Local-only persistence with versioning and guardrails.
 * Keeps data small + predictable for production use.
 */

const KEY = "po_arcade_v1";

export function loadState() {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return freshState();
    const parsed = JSON.parse(raw);

    // Minimal schema validation (avoid breaking on corrupt storage)
    if (!parsed || typeof parsed !== "object") return freshState();
    return { ...freshState(), ...parsed };
  } catch {
    return freshState();
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
      quickmath: { best: 0, last: null },
      wordle: { wins: 0, plays: 0, lastKey: null, lastGrid: null },
      sudoku: { saves: {} },
      tictactoe: { winsX: 0, winsO: 0, draws: 0 },
      hangman: { wins: 0, losses: 0 },
      chess: { winsW: 0, winsB: 0, draws: 0, last: null },
    },
  };
}
