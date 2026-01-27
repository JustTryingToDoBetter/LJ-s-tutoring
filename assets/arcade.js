
/* ==========================================================================
  Odyssey Arcade — App Shell
  - Builds game cards
  - Filters + search
  - "Continue" support
  - Loads chosen game in /arcade/play.html?g=<id>
========================================================================== */

(() => {
  "use strict";

  const LS = {
    lastGame: "po_arcade_last_game",
    sessions: "po_arcade_sessions",
    bestToday: "po_arcade_best_today",
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
  ];

  const $ = (sel, root = document) => root.querySelector(sel);
  const $$ = (sel, root = document) => Array.from(root.querySelectorAll(sel));

  function safeText(el, value) {
    if (el) el.textContent = String(value);
  }

  function getQueryParam(name) {
    const url = new URL(window.location.href);
    return url.searchParams.get(name);
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
    play.href = `/arcade/play.html?g=${encodeURIComponent(game.id)}`;
    play.textContent = "Play";
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
    safeText($("#arcade-stat-best"), localStorage.getItem(LS.bestToday) || "—");

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

  async function initPlay() {
    const mount = $("#game-mount");
    if (!mount) return;

    safeText($("#arcade-year"), new Date().getFullYear());

    const gameId = getQueryParam("g");
    const meta = GAMES.find((x) => x.id === gameId);

    safeText($("#play-title"), meta ? meta.title : "Game");
    safeText($("#play-sub"), meta ? meta.desc : "Odyssey Arcade");

    // restart/exit
    $("#play-exit")?.addEventListener("click", () =>
      window.location.assign("/arcade/")
    );
    $("#play-restart")?.addEventListener("click", () =>
      window.location.reload()
    );
    $("#play-loading")?.remove();

    if (!gameId) {
      $("#play-loading")?.remove();
      mount.innerHTML = `<div style="padding:16px;color:rgba(226,232,240,.72)">No game selected.</div>`;
      return;
    }

    // persist "last played"
    localStorage.setItem(LS.lastGame, gameId);

    // Reset mount each run
    mount.innerHTML = "";
    window.PO_ARCADE_MOUNT = mount;

    // Tiny app context
    const ctx = createArcadeCtx();

    const MODULE_GAMES = new Set(["wordle", "quickmath"]);

    try {
      // Module games
      if (MODULE_GAMES.has(gameId)) {
        const mod = await import(`/assets/games/${encodeURIComponent(gameId)}.js`);

        if (gameId === "wordle" && typeof mod.mountWordle === "function") {
          mod.mountWordle(mount, ctx);
        } else if (gameId === "quickmath" && typeof mod.mountQuickMath === "function") {
          mod.mountQuickMath(mount, ctx);
        } else {
          throw new Error(`Module loaded but no mount export found for ${gameId}.`);
        }
        return;
      }

      // IIFE games
      await loadScript(`/assets/games/${encodeURIComponent(gameId)}.js`);
      const reg = (window.PO_ARCADE_GAMES || []).find((g) => g.id === gameId);

      if (!reg || typeof reg.mount !== "function") {
        throw new Error(`Game registered incorrectly (missing mount) for ${gameId}.`);
      }

      reg.mount(mount);
    } catch (e) {
      mount.innerHTML = `
        <div style="padding:16px;color:rgba(226,232,240,.82)">
          <div style="font-weight:800;margin-bottom:6px">Game failed to start.</div>
          <div style="color:rgba(226,232,240,.65);font-size:13px">${escapeHtml(
            String(e?.message || e)
          )}</div>
        </div>
      `;
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
      state.games.quickmath = state.games.quickmath || { best: 0, last: null };

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

  function registerArcadeSW() {
    if (!("serviceWorker" in navigator)) return;
    navigator.serviceWorker
      .register("/assets/sw-arcade.js", { scope: "/arcade/" })
      .catch(() => {});
  }

  // Boot
  document.addEventListener("DOMContentLoaded", () => {
    registerArcadeSW();
    initHome();
    initPlay();
  });
})();
