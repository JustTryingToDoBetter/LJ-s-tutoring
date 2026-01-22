/**
 * Project Odysseus — Arcade Shell (Frontend-only)
 * - Loads game modules (IIFE registry) on demand
 * - Mounts selected game into #po-stage
 * - Saves light progress locally (no backend)
 */

(() => {
  "use strict";

  // ----------------------------
  // DOM helpers
  // ----------------------------
  const $ = (sel) => document.querySelector(sel);
  const $$ = (sel) => Array.from(document.querySelectorAll(sel));

  // ----------------------------
  // Local progress (device-only)
  // ----------------------------
  const PROFILE_KEY = "po_arcade_profile_v1";

  function startOfLocalDay(ts = Date.now()) {
    const d = new Date(ts);
    d.setHours(0, 0, 0, 0);
    return d.getTime();
  }

  function todaysSeed() {
    // stable per day (local time)
    const day = startOfLocalDay();
    // simple deterministic seed
    let x = day ^ 0x9e3779b9;
    x ^= x << 13; x ^= x >>> 17; x ^= x << 5;
    return (x >>> 0).toString(16).slice(0, 8).toUpperCase();
  }

  function loadProfile() {
    try {
      const raw = localStorage.getItem(PROFILE_KEY);
      if (!raw) return null;
      return JSON.parse(raw);
    } catch {
      return null;
    }
  }

  function saveProfile(p) {
    try {
      localStorage.setItem(PROFILE_KEY, JSON.stringify(p));
    } catch {
      // ignore
    }
  }

  function freshProfile() {
    return {
      lastDayStart: startOfLocalDay(),
      seed: todaysSeed(),
      streak: 0,
      completed: 0,
      // track if daily voyage done today
      dailyDoneDayStart: null
    };
  }

  function getProfile() {
    const p = loadProfile() || freshProfile();

    // new day rollover
    const today = startOfLocalDay();
    if (p.lastDayStart !== today) {
      // only increment streak if they completed daily yesterday
      const didDailyYesterday = p.dailyDoneDayStart === p.lastDayStart;
      p.streak = didDailyYesterday ? (p.streak + 1) : 0;

      p.lastDayStart = today;
      p.seed = todaysSeed();
      p.dailyDoneDayStart = null;
      // completed can be lifetime; keep it
    }

    saveProfile(p);
    return p;
  }

  function resetProfile() {
    saveProfile(freshProfile());
  }

  // ----------------------------
  // Game registry + loader
  // Your game files push objects to window.PO_ARCADE_GAMES
  // ----------------------------
  const GAME_MODULES = {
    quickmath: "/assets/games/quickmath.js",
    wordle: "/assets/games/wordle.js",
    sudoku: "/assets/games/sudoku.js",
    tictactoe: "/assets/games/tictactoe.js",
    hangman: "/assets/games/hangman.js",
    chess: "/assets/games/chess.js",
  };

  function getRegisteredGame(id) {
    const list = window.PO_ARCADE_GAMES || [];
    return list.find((g) => g && g.id === id) || null;
  }

  async function ensureGameLoaded(id) {
    // already registered
    if (getRegisteredGame(id)) return;

    const src = GAME_MODULES[id];
    if (!src) throw new Error(`No module mapping for game "${id}"`);

    // Dynamically import so:
    // - no named export required
    // - module just runs and registers itself
    await import(src);

    if (!getRegisteredGame(id)) {
      throw new Error(`Game "${id}" loaded but did not register itself.`);
    }
  }

  // ----------------------------
  // UI rendering
  // ----------------------------
  function renderProfile(p) {
    const streakEl = $("#po-streak");
    const completedEl = $("#po-completed");
    const seedEl = $("#po-seed");

    if (streakEl) streakEl.textContent = String(p.streak);
    if (completedEl) completedEl.textContent = String(p.completed);
    if (seedEl) seedEl.textContent = p.seed || "—";
  }

  function setTheme(isDark) {
    document.documentElement.classList.toggle("dark", !!isDark);
    const btn = $("#po-theme");
    if (btn) btn.setAttribute("aria-pressed", String(!!isDark));
    try { localStorage.setItem("po_arcade_theme", isDark ? "dark" : "light"); } catch {}
  }

  function initTheme() {
    let stored = null;
    try { stored = localStorage.getItem("po_arcade_theme"); } catch {}
    const prefersDark = window.matchMedia && window.matchMedia("(prefers-color-scheme: dark)").matches;
    setTheme(stored ? stored === "dark" : prefersDark);

    const btn = $("#po-theme");
    if (btn) {
      btn.addEventListener("click", () => {
        const isDark = document.documentElement.classList.contains("dark");
        setTheme(!isDark);
      });
    }
  }

  function showError(msg) {
    const stage = $("#po-stage");
    if (!stage) return;
    stage.innerHTML = `
      <div class="po-arcade-error">
        <h3 class="po-arcade-error-title">Arcade module failed to load</h3>
        <p class="po-arcade-error-msg">${escapeHtml(msg)}</p>
        <p class="po-arcade-error-hint">Check that dist/assets/games and dist/assets/lib were built and deployed.</p>
      </div>
    `;
  }

  function escapeHtml(s) {
    return String(s)
      .replaceAll("&", "&amp;")
      .replaceAll("<", "&lt;")
      .replaceAll(">", "&gt;")
      .replaceAll('"', "&quot;")
      .replaceAll("'", "&#039;");
  }

  // ----------------------------
  // Mount logic
  // ----------------------------
  let currentGameId = null;

  async function mountGame(id) {
    const stage = $("#po-stage");
    if (!stage) return;

    currentGameId = id;

    // loading state (fast feedback)
    stage.innerHTML = `
      <div class="po-arcade-loading">
        <div class="po-arcade-loading-title">Loading ${escapeHtml(id)}…</div>
        <div class="po-arcade-loading-sub">Preparing your next quest.</div>
      </div>
    `;

    try {
      await ensureGameLoaded(id);

      const game = getRegisteredGame(id);
      if (!game || typeof game.mount !== "function") {
        throw new Error(`Game "${id}" is missing a valid mount(root) function.`);
      }

      // mount
      game.mount(stage);
    } catch (err) {
      showError(err && err.message ? err.message : String(err));
    }
  }

  function initTabs() {
    const tabs = $$(".po-tab");
    if (!tabs.length) return;

    function selectTab(btn) {
      tabs.forEach((t) => t.setAttribute("aria-selected", "false"));
      btn.setAttribute("aria-selected", "true");

      const id = btn.getAttribute("data-game");
      if (id) mountGame(id);
    }

    tabs.forEach((btn) => {
      btn.addEventListener("click", () => selectTab(btn));
      btn.addEventListener("keydown", (e) => {
        // simple keyboard navigation
        const idx = tabs.indexOf(btn);
        if (e.key === "ArrowRight") {
          e.preventDefault();
          (tabs[idx + 1] || tabs[0]).focus();
        }
        if (e.key === "ArrowLeft") {
          e.preventDefault();
          (tabs[idx - 1] || tabs[tabs.length - 1]).focus();
        }
      });
    });

    // mount default selected
    const initial = tabs.find((t) => t.getAttribute("aria-selected") === "true") || tabs[0];
    selectTab(initial);
  }

  // ----------------------------
  // Daily Voyage (Quick Math + Word Voyage)
  // Frontend-only flow: after you finish, you can click “Complete Daily”
  // (We can later wire actual completion events from games.)
  // ----------------------------
  function initDailyVoyage() {
    const playBtn = $("#po-play-daily");
    const resetBtn = $("#po-reset-profile");
    if (resetBtn) {
      resetBtn.addEventListener("click", () => {
        resetProfile();
        const p = getProfile();
        renderProfile(p);
        mountGame("quickmath");
      });
    }

    if (!playBtn) return;

    playBtn.addEventListener("click", async () => {
      // step 1: quick math
      await mountGame("quickmath");

      // lightweight UX: after mounting quickmath, show a mini prompt to continue
      const stage = $("#po-stage");
      if (!stage) return;

      const nudge = document.createElement("div");
      nudge.className = "po-daily-nudge";
      nudge.innerHTML = `
        <div class="po-daily-nudge-card">
          <div class="po-daily-nudge-title">Daily Voyage</div>
          <div class="po-daily-nudge-sub">When you're done, continue to the word puzzle.</div>
          <div class="po-daily-nudge-actions">
            <button class="po-btn po-btn-primary" type="button" id="po-daily-next">Continue</button>
            <button class="po-btn po-btn-ghost" type="button" id="po-daily-complete">Mark Daily Complete</button>
          </div>
        </div>
      `;
      stage.prepend(nudge);

      $("#po-daily-next")?.addEventListener("click", async () => {
        await mountGame("wordle");
      });

      $("#po-daily-complete")?.addEventListener("click", () => {
        const p = getProfile();
        const today = startOfLocalDay();

        // only count once per day
        if (p.dailyDoneDayStart !== today) {
          p.dailyDoneDayStart = today;
          p.completed = (p.completed || 0) + 1;
          saveProfile(p);
        }

        renderProfile(getProfile());
        // small confirmation
        nudge.remove();
      });
    });
  }

  // ----------------------------
  // Service worker (offline after first load)
  // ----------------------------
  function initServiceWorker() {
    if (!("serviceWorker" in navigator)) return;
    // only try if the file exists in production; harmless if it fails
    navigator.serviceWorker.register("/assets/sw-arcade.js").catch(() => {});
  }



  // ----------------------------
  // Boot
  // ----------------------------
  function boot() {
    initTheme();
    initServiceWorker();

    const profile = getProfile();
    renderProfile(profile);

    initTabs();
    initDailyVoyage();
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", boot);
  } else {
    boot();
  }
})();
