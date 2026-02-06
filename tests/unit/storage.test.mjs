import { describe, it, expect, beforeEach } from "vitest";
import { loadState, saveState, resetState } from "../../assets/lib/storage.js";

const LEGACY_KEY = "po_arcade_state_v1";

beforeEach(() => {
  localStorage.clear();
});

describe("storage", () => {
  it("returns a fresh state when empty", () => {
    const state = loadState();
    expect(state).toMatchObject({
      version: 1,
      profile: { streak: 0, completed: 0, theme: "light" }
    });
  });

  it("persists and reloads state", () => {
    const state = loadState();
    state.profile.streak = 3;
    state.games.quickmath.best = 12;

    saveState(state);
    const next = loadState();

    expect(next.profile.streak).toBe(3);
    expect(next.games.quickmath.best).toBe(12);
  });

  it("migrates legacy quickmath data", () => {
    localStorage.setItem(LEGACY_KEY, JSON.stringify({
      games: {
        quickmath: {
          best: 42,
          dailyBest: { dayKey: "2026-02-06", score: 9 },
          last: { score: 8, streak: 2, answered: 10, at: 123 }
        }
      }
    }));

    const state = loadState();

    expect(state.games.quickmath.best).toBe(42);
    expect(state.games.quickmath.dailyBest).toEqual({ dayKey: "2026-02-06", score: 9 });
    expect(state.games.quickmath.last).toEqual({ score: 8, streak: 2, answered: 10, at: 123 });
  });

  it("resetState clears saved data", () => {
    const state = loadState();
    saveState(state);
    resetState();
    expect(localStorage.getItem("po_arcade_v1")).toBeNull();
  });
});
