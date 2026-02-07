import { JSDOM } from "jsdom";
import { performance } from "node:perf_hooks";
import { createArcadeStore } from "../assets/arcade/sdk-core.js";
import { createGameContext } from "../arcade/game-runtime.js";

const dom = new JSDOM("<!doctype html><html><body></body></html>", {
  url: "http://localhost/arcade/",
  pretendToBeVisual: true,
});

globalThis.window = dom.window;
globalThis.document = dom.window.document;
globalThis.navigator = dom.window.navigator;
globalThis.localStorage = dom.window.localStorage;
globalThis.CustomEvent = dom.window.CustomEvent;
globalThis.HTMLElement = dom.window.HTMLElement;
globalThis.HTMLCanvasElement = dom.window.HTMLCanvasElement;

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

async function bootGame({ id, path }) {
  const mod = await import(new URL(path, import.meta.url));
  const game = mod?.default || mod?.game;
  if (!game) throw new Error(`Missing export for ${id}`);

  const root = document.createElement("div");
  document.body.appendChild(root);

  const ctx = createGameContext({ root, gameId: id });
  ctx.ui = makeUiStub();
  ctx.store = createArcadeStore();

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
