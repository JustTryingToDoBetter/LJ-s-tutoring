/**
 * arcade.js
 * Main entry: loads state, mounts games, handles tabs, daily voyage, theme, offline.
 */

import { loadState, saveState, resetState } from "./lib/storage.js";
import { dayKey, hashStringToSeed } from "./lib/rng.js";
import { clear } from "./lib/ui.js";

import { mountQuickMath, runDailyQuickMath } from "./games/quickmath.js";
import { mountWordle, runDailyWordle } from "./games/wordle.js";
import { mountSudoku } from "./games/sudoku.js";
import { mountTicTacToe } from "./games/tictactoe.js";
import { mountHangman } from "./games/hangman.js";
import { mountChess } from "./games/chess.js";

const stage = document.getElementById("po-stage");
const streakEl = document.getElementById("po-streak");
const completedEl = document.getElementById("po-completed");
const seedEl = document.getElementById("po-seed");

const themeBtn = document.getElementById("po-theme");
const dailyBtn = document.getElementById("po-play-daily");
const resetBtn = document.getElementById("po-reset-profile");

const tabs = Array.from(document.querySelectorAll(".po-tab"));

let state = loadState();

initTheme();
renderTopStats();
initTabs();
initDaily();
initOffline();

// Default game on load
selectGame("quickmath");

function renderTopStats() {
  const key = dayKey();
  const seed = hashStringToSeed(`po-daily-${key}`);

  streakEl.textContent = String(state.profile.streak || 0);
  completedEl.textContent = String(state.profile.completed || 0);
  seedEl.textContent = String(seed).slice(0, 8);
}

function initTheme() {
  const isDark = state.profile.theme === "dark";
  document.body.classList.toggle("po-dark", isDark);
  themeBtn.setAttribute("aria-pressed", String(isDark));

  themeBtn.addEventListener("click", () => {
    const next = document.body.classList.toggle("po-dark");
    state.profile.theme = next ? "dark" : "light";
    themeBtn.setAttribute("aria-pressed", String(next));
    saveState(state);
  });
}

function initTabs() {
  // Click navigation
  tabs.forEach((btn) => {
    btn.addEventListener("click", () => selectGame(btn.dataset.game));
  });

  // Keyboard navigation (left/right)
  document.addEventListener("keydown", (e) => {
    const activeIdx = tabs.findIndex((t) => t.getAttribute("aria-selected") === "true");
    if (activeIdx < 0) return;

    if (e.key === "ArrowRight") {
      e.preventDefault();
      tabs[(activeIdx + 1) % tabs.length].click();
    }
    if (e.key === "ArrowLeft") {
      e.preventDefault();
      tabs[(activeIdx - 1 + tabs.length) % tabs.length].click();
    }
  });
}

function selectGame(gameId) {
  // Update tab states
  tabs.forEach((t) => t.setAttribute("aria-selected", String(t.dataset.game === gameId)));

  clear(stage);

  // Mount chosen game with shared state + safe persistence
  const ctx = {
    getState: () => state,
    setState: (next) => { state = next; saveState(state); renderTopStats(); },
    onQuestComplete: (meta) => {
      // meta: { gameId, points?, won?, dailyKey? }
      state.profile.completed += 1;
      saveState(state);
      renderTopStats();
    },
  };

  switch (gameId) {
    case "quickmath": mountQuickMath(stage, ctx); break;
    case "wordle": mountWordle(stage, ctx); break;
    case "sudoku": mountSudoku(stage, ctx); break;
    case "tictactoe": mountTicTacToe(stage, ctx); break;
    case "hangman": mountHangman(stage, ctx); break;
    case "chess": mountChess(stage, ctx); break;
    default: mountQuickMath(stage, ctx);
  }
}

function initDaily() {
  dailyBtn.addEventListener("click", async () => {
    // Daily voyage: Quick Math + Wordle variant back-to-back
    const key = dayKey();
    const dailyAlready = !!state.daily.history[key];

    clear(stage);

    // Run quick math daily
    const qmResult = await runDailyQuickMath(stage, {
      getState: () => state,
      setState: (next) => { state = next; saveState(state); renderTopStats(); },
    });

    // Run wordle daily
    const wResult = await runDailyWordle(stage, {
      getState: () => state,
      setState: (next) => { state = next; saveState(state); renderTopStats(); },
    });

    // Mark daily completion + streak handling
    if (qmResult.completed && wResult.completed) {
      state.daily.history[key] = true;

      if (!dailyAlready) {
        const prevKey = state.profile.lastDailyKey;
        // Streak increments if yesterday was completed; else resets to 1
        const yesterday = new Date();
        yesterday.setDate(yesterday.getDate() - 1);
        const yKey = dayKey(yesterday);

        state.profile.streak = prevKey === yKey ? (state.profile.streak + 1) : 1;
        state.profile.lastDailyKey = key;
        state.profile.completed += 1;
      }

      saveState(state);
      renderTopStats();
    }
  });

  resetBtn.addEventListener("click", () => {
    // Hard reset: wipes local arcade progress
    resetState();
    state = loadState();
    initTheme();
    renderTopStats();
    selectGame("quickmath");
  });
}

function initOffline() {
  // Offline caching (safe for static sites)
  if ("serviceWorker" in navigator) {
    navigator.serviceWorker.register("/assets/sw-arcade.js").catch(() => {
      // If SW fails, arcade still works online. No action needed.
    });
  }
}
