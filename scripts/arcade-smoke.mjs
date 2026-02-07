import { JSDOM } from "jsdom";
import { performance } from "node:perf_hooks";

const dom = new JSDOM("<!doctype html><html><body></body></html>", {
  url: "http://localhost/arcade/",
  pretendToBeVisual: true,
});

const assignGlobal = (key, value) => {
  try {
    globalThis[key] = value;
  } catch {
    const desc = Object.getOwnPropertyDescriptor(globalThis, key);
    if (!desc || desc.configurable) {
      Object.defineProperty(globalThis, key, { value, configurable: true });
    }
  }
};

assignGlobal("window", dom.window);
assignGlobal("document", dom.window.document);
assignGlobal("navigator", dom.window.navigator);
assignGlobal("localStorage", dom.window.localStorage);
assignGlobal("CustomEvent", dom.window.CustomEvent);
assignGlobal("HTMLElement", dom.window.HTMLElement);
assignGlobal("HTMLCanvasElement", dom.window.HTMLCanvasElement);
assignGlobal("AbortController", dom.window.AbortController);
assignGlobal("AbortSignal", dom.window.AbortSignal);

globalThis.performance = globalThis.performance || performance;

globalThis.requestAnimationFrame = (cb) => setTimeout(() => cb(performance.now()), 16);
globalThis.cancelAnimationFrame = (id) => clearTimeout(id);

globalThis.matchMedia = globalThis.matchMedia || (() => ({
  matches: false,
  addEventListener: () => {},
  removeEventListener: () => {},
}));

class ResizeObserverStub {
  constructor(cb) { this._cb = cb; }
  observe() {}
  unobserve() {}
  disconnect() {}
}

globalThis.ResizeObserver = globalThis.ResizeObserver || ResizeObserverStub;

class InstantImage {
  set src(value) {
    this._src = value;
    setTimeout(() => this.onload && this.onload(), 0);
  }
}

globalThis.Image = InstantImage;

const ctx2d = new Proxy({
  canvas: {},
}, {
  get: (obj, prop) => (prop in obj ? obj[prop] : () => {}),
  set: (obj, prop, value) => {
    obj[prop] = value;
    return true;
  },
});

dom.window.HTMLCanvasElement.prototype.getContext = function getContext() {
  return ctx2d;
};

const fakePacks = {
  "/arcade/packs/quickmath-rules.json": {
    ops: [{ op: "+", minA: 1, maxA: 9, minB: 1, maxB: 9, points: 1 }],
  },
  "/arcade/packs/hangman-words.json": {
    entries: [{ w: "ODYSSEY", hint: "Voyage" }],
  },
  "/assets/data/words-5.json": {
    answers: ["ODYSY", "ATHEN"],
    allowed: ["ODYSY", "ATHEN"],
  },
};

const realFetch = globalThis.fetch;
globalThis.fetch = async (input, init) => {
  const url = typeof input === "string" ? input : input.url;
  const path = new URL(url, "http://localhost").pathname;
  if (fakePacks[path]) {
    return new Response(JSON.stringify(fakePacks[path]), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  }
  if (typeof realFetch === "function") {
    return realFetch(input, init);
  }
  return new Response("Not Found", { status: 404 });
};

const games = [
  { id: "invaders", path: "../assets/games/invaders.js" },
  { id: "asteroids", path: "../assets/games/asteroids.js" },
  { id: "2048", path: "../assets/games/2048.js" },
  { id: "minesweeper", path: "../assets/games/minesweeper.js" },
  { id: "quickmath", path: "../assets/games/quickmath.js" },
  { id: "sudoku", path: "../assets/games/sudoku.js" },
  { id: "wordle", path: "../assets/games/wordle.js" },
  { id: "hangman", path: "../assets/games/hangman.js" },
  { id: "tictactoe", path: "../assets/games/tictactoe.js" },
  { id: "chess", path: "../assets/games/chess.js" },
  { id: "snake", path: "../assets/games/snake.js" },
  { id: "pong", path: "../assets/games/pong.js" },
];

const makeUiStub = () => ({
  setHUD: () => {},
  setControls: () => {},
  setStatus: () => {},
  showToast: () => {},
  showModal: () => ({ close: () => {} }),
});

const createGameContext = ({ root, gameId }) => {
  const cleanups = new Set();
  const controller = new AbortController();
  const { signal } = controller;

  const onCleanup = (fn) => {
    if (typeof fn !== "function") return () => {};
    cleanups.add(fn);
    return () => cleanups.delete(fn);
  };

  const cleanupAll = () => {
    controller.abort();
    for (const fn of Array.from(cleanups).reverse()) {
      try { fn(); } catch {}
    }
    cleanups.clear();
  };

  const addEvent = (target, type, handler, options = {}) => {
    if (!target?.addEventListener) return () => {};
    const opts = options && typeof options === "object" ? { ...options, signal } : options;
    target.addEventListener(type, handler, opts);
    return onCleanup(() => {
      try { target.removeEventListener(type, handler, options); } catch {}
    });
  };

  const timeout = (fn, ms) => {
    const id = setTimeout(fn, ms);
    return onCleanup(() => clearTimeout(id));
  };

  const interval = (fn, ms) => {
    const id = setInterval(fn, ms);
    return onCleanup(() => clearInterval(id));
  };

  const raf = (loopFn) => {
    let rafId = 0;
    let active = true;
    const tick = (t) => {
      if (!active) return;
      loopFn(t);
      rafId = requestAnimationFrame(tick);
    };
    rafId = requestAnimationFrame(tick);
    return onCleanup(() => {
      active = false;
      if (rafId) cancelAnimationFrame(rafId);
    });
  };

  const resizeObserver = (el, cb) => {
    if (!("ResizeObserver" in globalThis)) return () => {};
    const ro = new ResizeObserver(cb);
    ro.observe(el);
    return onCleanup(() => ro.disconnect());
  };

  const clearRoot = () => {
    while (root.firstChild) root.removeChild(root.firstChild);
  };

  const storageKey = (k) => `po_arcade_${gameId}_${k}`;
  const storage = {
    get(k, fallback = null) {
      try {
        const v = localStorage.getItem(storageKey(k));
        return v == null ? fallback : JSON.parse(v);
      } catch { return fallback; }
    },
    set(k, v) {
      try { localStorage.setItem(storageKey(k), JSON.stringify(v)); } catch {}
    },
    del(k) {
      try { localStorage.removeItem(storageKey(k)); } catch {}
    },
  };

  return {
    root,
    gameId,
    signal,
    onCleanup,
    cleanupAll,
    clearRoot,
    addEvent,
    timeout,
    interval,
    raf,
    resizeObserver,
    storage,
  };
};

const createArcadeStore = () => {
  let state = { games: {} };
  return {
    get: () => state,
    set: (next) => {
      state = next || { games: {} };
      return state;
    },
    updateGame: (gameId, updater) => {
      const next = {
        ...state,
        games: {
          ...state.games,
          [gameId]: { ...(state.games?.[gameId] || {}) },
        },
      };
      const patch = updater(next.games[gameId]) || {};
      next.games[gameId] = { ...next.games[gameId], ...patch };
      state = next;
      return state;
    },
  };
};

const createStorageManager = (store, gameId) => {
  const normalize = (g = {}) => ({
    plays: Number.isFinite(g.plays) ? g.plays : 0,
    lastPlayed: g.lastPlayed || null,
    bestScore: Number.isFinite(g.bestScore) ? g.bestScore : 0,
    bestToday: g.bestToday || null,
    streak: Number.isFinite(g.streak) ? g.streak : 0,
    wins: Number.isFinite(g.wins) ? g.wins : 0,
    losses: Number.isFinite(g.losses) ? g.losses : 0,
    draws: Number.isFinite(g.draws) ? g.draws : 0,
    settings: g.settings && typeof g.settings === "object" ? g.settings : {},
  });

  const getRaw = () => store.get().games?.[gameId] || {};

  return {
    get() {
      return normalize(getRaw());
    },
    update(patch) {
      return store.updateGame(gameId, (g) => normalize({ ...g, ...patch }));
    },
    recordPlay() {
      const now = Date.now();
      return store.updateGame(gameId, (g) => {
        const base = normalize(g);
        return { ...base, plays: base.plays + 1, lastPlayed: now };
      });
    },
    recordScore(score) {
      const value = Number(score) || 0;
      return store.updateGame(gameId, (g) => {
        const base = normalize(g);
        return { ...base, bestScore: Math.max(base.bestScore, value) };
      });
    },
    setSettings(patch) {
      return store.updateGame(gameId, (g) => {
        const base = normalize(g);
        return { ...base, settings: { ...base.settings, ...patch } };
      });
    },
  };
};

async function bootGame({ id, path }) {
  const mod = await import(new URL(path, import.meta.url));
  const game = mod?.default || mod?.game;
  if (!game) throw new Error(`Missing export for ${id}`);

  const root = document.createElement("div");
  document.body.appendChild(root);

  const ctx = createGameContext({ root, gameId: id });
  ctx.ui = makeUiStub();
  ctx.store = createArcadeStore();
  ctx.storage = createStorageManager(ctx.store, id);
  ctx.storage.recordPlay();

  const boot = game.init
    ? game.init(ctx)
    : game.mount
      ? game.mount(ctx.root, ctx)
      : Promise.reject(new Error(`No init/mount for ${id}`));

  await Promise.race([
    Promise.resolve(boot),
    new Promise((_, reject) => setTimeout(() => reject(new Error(`Timeout booting ${id}`)), 2500)),
  ]);

  if (typeof game.destroy === "function") {
    await game.destroy(ctx);
  }
  ctx.cleanupAll();
  root.remove();
}

async function main() {
  for (const game of games) {
    await bootGame(game);
    console.log(`OK: ${game.id} booted`);
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
