
/* ==========================================================================
  Odyssey Arcade — App Shell
  - Builds game cards
  - Filters + search
  - "Continue" support
  - Loads chosen game in /arcade/play.html?g=<id>
========================================================================== */

(() => {
  "use strict";

  const ASSET_BASE = "/assets";

  const LS = {
    lastGame: "po_arcade_last_game",
    sessions: "po_arcade_sessions",
    sound: "po_arcade_sound",
  };

const GAMES = [
  {
    id: "quickmath",
    title: "Quick Math",
    desc: "60-second drills for speed + accuracy.",
    icon: "⚡",
    lane: ["quick", "daily"],
    tags: ["~1 min", "Daily", "Math"],
  },
  {
    id: "sudoku",
    title: "Sudoku",
    desc: "Pattern recognition + logic focus.",
    icon: "🧩",
    lane: ["daily"],
    tags: ["~3–8 min", "Daily", "Logic"],
    howTo: {
      subtitle: "Complete the grid so every row, column, and 3×3 box has 1–9.",
      steps: [
        "Tap a cell to select it.",
        "Fill numbers so no row, column, or box repeats.",
        "Use notes mode for possibilities. Hints are limited — use wisely.",
      ],
      controls: [
        "Keyboard: 1–9 to fill, Backspace to clear, N for notes, H for hint.",
        "Touch: tap a cell, then use the number pad.",
      ],
    },
  },
  {
    id: "wordle",
    title: "Word Voyage",
    desc: "Word puzzle for consistency + focus.",
    icon: "🗺️",
    lane: ["daily"],
    tags: ["~2–5 min", "Daily", "Puzzle"],
  },
  {
    id: "hangman",
    title: "Hangman",
    desc: "Light puzzle for vocab + reasoning.",
    icon: "🪢",
    lane: ["quick"],
    tags: ["~2 min", "Quick", "Puzzle"],
  },
  {
    id: "tictactoe",
    title: "Tic Tac Toe",
    desc: "Simple strategy. Great for quick battles.",
    icon: "⭕",
    lane: ["quick", "two"],
    tags: ["~1–2 min", "2 Player", "Strategy"],
  },
  {
    id: "chess",
    title: "Aegean Chess",
    desc: "Local 2-player chess. Clean and fast.",
    icon: "♟️",
    lane: ["strategy", "two"],
    tags: ["Strategy", "2 Player", "Classic"],
  },

  // ✅ NEW
  {
    id: "snake",
    title: "Serpent of Scylla",
    desc: "Swipe + d-pad snake. Speed tiers and local best.",
    icon: "🐍",
    lane: ["quick", "daily"],
    tags: ["~2–6 min", "Arcade", "Reflex"],
    howTo: {
      subtitle: "Eat to grow. Avoid walls and your own tail.",
      steps: [
        "Collect food to score and grow longer.",
        "Don’t collide with yourself (or walls if wrap is off).",
        "Speed ramps up as you get better.",
      ],
      controls: [
        "Keyboard: Arrow keys or WASD.",
        "Touch: swipe or use the on-screen d-pad.",
      ],
    },
  },
  {
    id: "pong",
    title: "Aegean Rally",
    desc: "Pong with 1P vs AI or 2P local. Drag to move.",
    icon: "🏓",
    lane: ["quick", "two", "strategy"],
    tags: ["~2–8 min", "Arcade", "2 Player"],
    howTo: {
      subtitle: "First to 7 wins. Keep the rally alive.",
      steps: [
        "Move your paddle to bounce the ball back.",
        "Score when the ball passes your opponent.",
        "Switch to 2P for local head-to-head.",
      ],
      controls: [
        "Keyboard: W/S (P1) and ↑/↓ (P2).",
        "Touch: drag on your side to move the paddle.",
      ],
    },
  },
];
  const $ = (sel, root = document) => root.querySelector(sel);
  const $$ = (sel, root = document) => Array.from(root.querySelectorAll(sel));

  const MIGRATED_GAMES = new Set(["pong", "snake", "sudoku", "wordle", "hangman", "tictactoe", "chess", "quickmath"]);

  function safeText(el, value) {
    if (el) el.textContent = String(value);
  }

  function getQueryParam(name) {
    const url = new URL(window.location.href);
    return url.searchParams.get(name);
  }

  // Shared day key (YYYY-MM-DD) for “best today” stats.
  function dayKey(date = new Date()) {
    const y = date.getFullYear();
    const m = String(date.getMonth() + 1).padStart(2, "0");
    const d = String(date.getDate()).padStart(2, "0");
    return `${y}-${m}-${d}`;
  }

  function getBestTodayScore() {
    try {
      const raw = localStorage.getItem("po_arcade_state_v1");
      if (!raw) return "—";
      const state = JSON.parse(raw);
      const daily = state?.games?.quickmath?.dailyBest;
      if (!daily || daily.dayKey !== dayKey()) return "—";
      return typeof daily.score === "number" ? String(daily.score) : "—";
    } catch {
      return "—";
    }
  }

  function setSoundUI(btn, on) {
    if (!btn) return;
    btn.setAttribute("aria-pressed", on ? "true" : "false");
    btn.innerHTML = on
      ? "<span aria-hidden='true'>🔊</span>"
      : "<span aria-hidden='true'>🔈</span>";
  }

  function buildCard(game) {
    const card = document.createElement("article");
    card.className = "po-arcade__card";
    card.dataset.lane = game.lane.join(" ");
    card.dataset.title = game.title.toLowerCase();

    const head = document.createElement("div");
    head.className = "po-arcade__card-head";

    const left = document.createElement("div");
    left.style.display = "flex";
    left.style.alignItems = "center";
    left.style.gap = "12px";

    const ico = document.createElement("div");
    ico.className = "po-arcade__card-ico";
    ico.innerHTML = `<span aria-hidden="true">${game.icon}</span>`;

    const titleWrap = document.createElement("div");
    const title = document.createElement("div");
    title.className = "po-arcade__card-title";
    title.textContent = game.title;

    titleWrap.appendChild(title);
    left.appendChild(ico);
    left.appendChild(titleWrap);

    head.appendChild(left);
    card.appendChild(head);

    const desc = document.createElement("p");
    desc.className = "po-arcade__card-desc";
    desc.textContent = game.desc;
    card.appendChild(desc);

    const chips = document.createElement("div");
    chips.className = "po-arcade__card-chips";
    for (const t of game.tags) {
      const tag = document.createElement("span");
      tag.className = "po-arcade__tag";
      tag.textContent = t;
      chips.appendChild(tag);
    }
    card.appendChild(chips);

    const actions = document.createElement("div");
    actions.className = "po-arcade__card-actions";

    const play = document.createElement("a");
    play.className = "po-arcade__btn po-arcade__btn--primary";
    play.href = MIGRATED_GAMES.has(game.id)
      ? `/arcade/games/${encodeURIComponent(game.id)}/`
      : `/arcade/play.html?g=${encodeURIComponent(game.id)}`;
    play.textContent = "Play";

    // Performance: warm the module cache on intent.
    play.addEventListener("pointerenter", () => preloadModule(`${ASSET_BASE}/games/${game.id}.js`), { passive: true });
    play.addEventListener("focus", () => preloadModule(`${ASSET_BASE}/games/${game.id}.js`));
    play.addEventListener("pointerenter", () => preloadModule(`${ASSET_BASE}/arcade/frame.js`), { passive: true });
    play.addEventListener("focus", () => preloadModule(`${ASSET_BASE}/arcade/frame.js`));

    play.addEventListener("click", () => {
      localStorage.setItem(LS.lastGame, game.id);
      const sessions = Number(localStorage.getItem(LS.sessions) || "0") + 1;
      localStorage.setItem(LS.sessions, String(sessions));
    });

    actions.appendChild(play);
    card.appendChild(actions);

    return card;
  }

  function applyFilter({ filter, query }) {
    const cards = $$("#arcade-grid .po-arcade__card");
    const q = (query || "").trim().toLowerCase();

    for (const c of cards) {
      const lane = c.dataset.lane || "";
      const title = c.dataset.title || "";
      const passFilter = filter === "all" ? true : lane.includes(filter);
      const passQuery = !q ? true : title.includes(q);
      c.style.display = passFilter && passQuery ? "" : "none";
    }
  }

  function initHome() {
    const grid = $("#arcade-grid");
    if (!grid) return;

    // year
    safeText($("#arcade-year"), new Date().getFullYear());

    // stats
    safeText($("#arcade-stat-sessions"), localStorage.getItem(LS.sessions) || "0");
    safeText($("#arcade-stat-best"), getBestTodayScore());

    // build cards
    grid.innerHTML = "";
    for (const g of GAMES) grid.appendChild(buildCard(g));

    // continue
    const last = localStorage.getItem(LS.lastGame);
    const cont = $("#arcade-continue");
    const contSub = $("#arcade-continue-sub");
    const contBtn = $("#arcade-continue-btn");

    if (cont && contBtn && last) {
      const meta = GAMES.find((x) => x.id === last);
      cont.hidden = false;
      safeText(contSub, meta ? meta.title : last);
      contBtn.href = `/arcade/play.html?g=${encodeURIComponent(last)}`;
    }

    // filter chips
    const chips = $$(".po-arcade__chip");
    let active = "all";

    function setActiveChip(next) {
      active = next;
      for (const ch of chips) {
        const is = ch.dataset.filter === next;
        ch.classList.toggle("is-active", is);
        ch.setAttribute("aria-selected", is ? "true" : "false");
      }
      applyFilter({ filter: active, query: $("#arcade-search")?.value || "" });
    }

    for (const ch of chips) {
      ch.addEventListener("click", () => setActiveChip(ch.dataset.filter || "all"));
    }

    // search
    const search = $("#arcade-search");
    if (search) {
      search.addEventListener("input", () => {
        applyFilter({ filter: active, query: search.value });
      });
    }

    // sound toggle (UI only)
    const soundBtn = $("#arcade-sound-toggle");
    const soundOn = (localStorage.getItem(LS.sound) || "0") === "1";
    setSoundUI(soundBtn, soundOn);
    soundBtn?.addEventListener("click", () => {
      const next = !((localStorage.getItem(LS.sound) || "0") === "1");
      localStorage.setItem(LS.sound, next ? "1" : "0");
      setSoundUI(soundBtn, next);
    });
  }

  function loadScript(src) {
    return new Promise((resolve, reject) => {
      const s = document.createElement("script");
      s.src = src;
      s.defer = true;
      s.onload = () => resolve();
      s.onerror = () => reject(new Error(`Failed to load ${src}`));
      document.head.appendChild(s);
    });
  }

  const _preloaded = new Set();
  function preloadModule(href) {
    if (!href || _preloaded.has(href)) return;
    _preloaded.add(href);

    // If modulepreload isn't supported, just skip.
    const link = document.createElement("link");
    link.rel = "modulepreload";
    link.href = href;
    document.head.appendChild(link);
  }

  async function initPlay() {
    const mount = $("#game-mount");
    if (!mount) return;

    const setNoScroll = (on) => {
      document.documentElement.classList.toggle("arcade-page--no-scroll", on);
      document.body.classList.toggle("arcade-page--no-scroll", on);
    };

    safeText($("#arcade-year"), new Date().getFullYear());

    const howToBtn = $("#play-howto");
    const settingsBtn = $("#play-settings");
    const pauseBtn = $("#play-pause");
    const restartBtn = $("#play-restart");

    const gameId = getQueryParam("g");
    const meta = GAMES.find((x) => x.id === gameId);

    safeText($("#play-title"), meta ? meta.title : "Game");
    safeText($("#play-sub"), meta ? meta.desc : "Odyssey Arcade");



    $("#play-loading")?.remove();

    if (!gameId) {
      mount.innerHTML = `<div class="po-arcade__muted" style="padding:16px">No game selected.</div>`;
      return;
    }

    if (MIGRATED_GAMES.has(gameId)) {
      const qs = window.location.search || "";
      window.location.assign(`/arcade/games/${encodeURIComponent(gameId)}/${qs}`);
      return;
    }

    localStorage.setItem(LS.lastGame, gameId);

    // Create frame + tiny app context
    const ctx = createArcadeCtx();

    let frame = null;
    let activeGame = null; // lifecycle object
    let runtime = null;
    let moduleLoader = null;
    let isPaused = false;
    let isGameActive = false;
    let keyGuardOff = null;

    const cleanup = () => {
      try { activeGame?.destroy?.(); } catch {}
      try { frame?.destroy?.(); } catch {}
      activeGame = null;
      frame = null;
      isGameActive = false;
      setNoScroll(false);
    };

    $("#play-exit")?.addEventListener("click", () => {
      cleanup();
      window.location.assign("/arcade/");
    });
    $("#play-restart")?.addEventListener("click", () => {
      cleanup();
      window.location.reload();
    });

    try {
      const frameUrl = `${ASSET_BASE}/arcade/frame.js`;
      const gameUrl = `${ASSET_BASE}/games/${encodeURIComponent(gameId)}.js`;
      const sdkUrl = `${ASSET_BASE}/arcade/sdk-core.js`;

      const [{ createGameFrame }, mod, sdkCore] = await Promise.all([
        import(frameUrl),
        import(gameUrl),
        import(sdkUrl),
      ]);

      frame = createGameFrame({
        mount,
        title: meta ? meta.title : "Game",
        subtitle: meta ? meta.desc : "Odyssey Arcade",
      });

      // expose frame API to games
      ctx.ui = frame;


      const normalizeGameModule = (gameId, mod) => {
        const candidate = mod?.default ?? mod?.game ?? null;
        if (candidate?.init && typeof candidate.init === "function") return candidate;
        if (candidate?.mount && typeof candidate.mount === "function") {
          return { ...candidate, init: (ctx) => candidate.mount(ctx.root, ctx) };
        }
        if (gameId === "wordle" && typeof mod.mountWordle === "function") {
          return { init: (ctx) => mod.mountWordle(ctx.root, ctx) };
        }
        if (gameId === "quickmath" && typeof mod.mountQuickMath === "function") {
          return { init: (ctx) => mod.mountQuickMath(ctx.root, ctx) };
        }
        return null;
      };

      const game = normalizeGameModule(gameId, mod);

      const setPauseUI = (paused) => {
        isPaused = paused;
        if (pauseBtn) pauseBtn.setAttribute("aria-pressed", paused ? "true" : "false");
        if (pauseBtn) pauseBtn.innerHTML = paused
          ? "<span aria-hidden='true'>▶</span>"
          : "<span aria-hidden='true'>⏸</span>";
      };

      setPauseUI(false);

      const openHowTo = (auto = false) => {
        const how = meta?.howTo || {};
        frame?.showHowTo?.({
          gameId,
          title: meta?.title || "How to Play",
          subtitle: how.subtitle,
          steps: how.steps || [],
          controls: how.controls || [],
          auto,
        });
      };

      const { createArcadeStore, createAudioManager, createInputManager, prefersReducedMotion, createSettingsStore, createStorageManager } = sdkCore;
      const settingsStore = createSettingsStore();
      const audio = createAudioManager(settingsStore);

      if (!game) throw new Error(`Game module has no valid mount export for "${gameId}".`);

      const [{ createGameRuntime }] = await Promise.all([
        import("/arcade/game-runtime.js"),
      ]);

      const store = createArcadeStore();
      const storage = createStorageManager(store, gameId, {
        legacyKeys: [
          `po_arcade_${gameId}_v1`,
          `po_arcade_${gameId}_v2`,
          `po_arcade_${gameId}_v3`,
          `po_arcade_${gameId}_v4`,
          `po_arcade_${gameId}`,
        ],
      });

      runtime = createGameRuntime({
        mountEl: frame.stageInner,
        createContext: (base) => ({
          ui: frame,
          store,
          audio,
          input: createInputManager(base),
          storage,
          settings: settingsStore,
          prefs: { reducedMotion: settingsStore.get().reducedMotion ?? prefersReducedMotion() },
        }),
      });

      moduleLoader = async () => ({ default: game });

      const mountWithRuntime = async () => {
        await runtime.mountGame({ id: gameId, moduleLoader });
      };

      activeGame = {
        resize: runtime.resize,
        pause: () => { runtime.pause(); setPauseUI(true); },
        resume: () => { runtime.resume(); setPauseUI(false); },
        destroy: runtime.destroyActive,
        restart: async () => {
          await runtime.destroyActive();
          await mountWithRuntime();
          setPauseUI(false);
          frame?.focusStage?.();
        },
        audio,
        settings: settingsStore,
      };

      await mountWithRuntime();
      isGameActive = true;
      setNoScroll(true);
      setPauseUI(false);
      frame?.focusStage?.();

      const openSettings = () => {
        if (!frame?.showSettings) return;
        const getSettings = () => settingsStore.get();
        const apply = (patch) => {
          if (Object.prototype.hasOwnProperty.call(patch, "mute")) audio.setMute(patch.mute);
          if (Object.prototype.hasOwnProperty.call(patch, "sfxVolume")) audio.setSfxVolume(patch.sfxVolume);
          if (Object.prototype.hasOwnProperty.call(patch, "musicVolume")) audio.setMusicVolume(patch.musicVolume);
          if (Object.prototype.hasOwnProperty.call(patch, "reducedMotion")) {
            settingsStore.set({ reducedMotion: patch.reducedMotion });
          }
        };

        frame.showSettings({
          settings: getSettings(),
          onChange: apply,
        });
      };

      openHowTo(true);

      howToBtn?.addEventListener("click", () => openHowTo(false));
      settingsBtn?.addEventListener("click", () => openSettings());

      const preventScrollKeys = new Set(["ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight", " ", "Spacebar", "PageUp", "PageDown", "Home", "End"]);
      const isEditable = (el) => {
        if (!el) return false;
        if (el.isContentEditable) return true;
        const tag = el.tagName?.toLowerCase();
        return tag === "input" || tag === "textarea" || tag === "select";
      };

      const onKeyDown = (e) => {
        if (!preventScrollKeys.has(e.key)) return;
        const target = e.target;
        if (isEditable(target)) return;
        if (!isGameActive) return;
        e.preventDefault();
      };

      window.addEventListener("keydown", onKeyDown, { passive: false, signal: frame.signal });
      keyGuardOff = () => window.removeEventListener("keydown", onKeyDown);

      pauseBtn?.addEventListener("click", () => {
        if (!activeGame) return;
        if (isPaused) {
          activeGame.resume?.();
          setPauseUI(false);
          frame?.closeModal?.();
          return;
        }
        activeGame.pause?.();
        setPauseUI(true);
        frame?.showPause?.({
          onResume: () => { activeGame.resume?.(); setPauseUI(false); },
          onRestart: () => activeGame.restart?.() || window.location.reload(),
          onSettings: () => openSettings(),
          onQuit: () => window.location.assign("/arcade/"),
        });
      });

      restartBtn?.addEventListener("click", () => activeGame?.restart?.() || window.location.reload());

      // Lifecycle hooks (mobile + reliability)
      const onResize = () => activeGame?.resize?.();
      window.addEventListener("resize", onResize, { passive: true, signal: frame.signal });

      document.addEventListener(
        "visibilitychange",
        () => {
          if (!activeGame) return;
          if (document.hidden) {
            activeGame.pause?.();
            setPauseUI(true);
          } else {
            activeGame.resume?.();
            setPauseUI(false);
          }
        },
        { signal: frame.signal }
      );
    } catch (e) {
      // Fall back to a clean, styled error surface (no inline soup)
      const msg = String(e?.message || e);

      mount.innerHTML = `
        <section class="po-arcade__panel po-animate-in" style="padding:14px">
          <div style="font-weight:900;margin-bottom:6px;color:rgba(226,232,240,.95)">Game failed to start</div>
          <div class="po-muted" style="font-size:12px">${escapeHtml(msg)}</div>
        </section>
      `;
      cleanup();
    }
  }

  function createArcadeCtx() {
    const KEY = "po_arcade_state_v1";

    const safeParse = (raw) => {
      try {
        return raw ? JSON.parse(raw) : null;
      } catch {
        return null;
      }
    };

    const ensureShape = (s) => {
      const state = s && typeof s === "object" ? s : {};
      state.games =
        state.games && typeof state.games === "object" ? state.games : {};

      // ensure per-game state exists
      state.games.wordle = state.games.wordle || {
        wins: 0,
        plays: 0,
        lastKey: "",
        lastGrid: [],
      };
      // quickmath schema:
      // - best: number (all-time)
      // - dailyBest: { dayKey: "YYYY-MM-DD", score: number }
      // - last: { score, streak, answered, at }
      state.games.quickmath = state.games.quickmath || { best: 0, dailyBest: null, last: null };

      return state;
    };

    const getState = () => ensureShape(safeParse(localStorage.getItem(KEY)));
    const setState = (next) => {
      try {
        localStorage.setItem(KEY, JSON.stringify(ensureShape(next)));
      } catch {}
    };

    return {
      getState,
      setState,
      onQuestComplete: () => {}, // optional hook
    };
  }

  function escapeHtml(s) {
    return String(s).replace(/[&<>\"']/g, (m) =>
      ({
        "&": "&amp;",
        "<": "&lt;",
        ">": "&gt;",
        '"': "&quot;",
        "'": "&#039;",
      }[m])
    );
  }



  // Boot
  document.addEventListener("DOMContentLoaded", () => {
    initHome();
    initPlay();
  });
})();
