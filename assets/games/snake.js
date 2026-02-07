/**
 * Snake — "Serpent of Scylla" (Module lifecycle version)
 * - Shared Game Frame (ctx.ui)
 * - AbortController cleanup (events)
 * - Responsive canvas, mobile swipe + on-screen dpad, keyboard arrows/WASD
 * - Pause/Resume, speed tiers, local high score
 */

import { el, clear } from "../lib/ui.js";
import { hashStringToSeed, seededRng, dayKey } from "../lib/rng.js";

const STORAGE_KEY = "po_arcade_snake_v3";

const load = () => { try { return JSON.parse(localStorage.getItem(STORAGE_KEY) || "null"); } catch { return null; } };
const save = (s) => { try { localStorage.setItem(STORAGE_KEY, JSON.stringify(s)); } catch {} };
const clearSave = () => { try { localStorage.removeItem(STORAGE_KEY); } catch {} };

const clamp = (v, a, b) => Math.max(a, Math.min(b, v));

function seededRandForSession() {
  // stable-ish per day but still different per session start
  const seed = `po-snake-${dayKey()}-${Date.now()}-${Math.random()}`;
  return seededRng(hashStringToSeed(seed));
}

function makeInitialState(restored) {
  const base = {
    v: 3,
    cols: 18,
    rows: 26,
    speed: "normal", // slow|normal|fast
    wrap: false,
    score: 0,
    best: 0,
    paused: false,
    over: false,
    dir: "D",
    nextDir: "D",
    snake: [{ x: 9, y: 12 }, { x: 9, y: 11 }, { x: 9, y: 10 }],
    food: { x: 6, y: 18 },
    status: "Swipe or use arrows. Eat to grow.",
  };

  if (restored?.v === 3) {
    const merged = { ...base, ...restored };
    if (!Array.isArray(merged.snake) || merged.snake.length < 2) merged.snake = base.snake;
    if (!merged.food) merged.food = base.food;
    merged.score = Number.isFinite(merged.score) ? merged.score : 0;
    merged.best = Number.isFinite(merged.best) ? merged.best : 0;
    merged.paused = Boolean(merged.paused);
    merged.over = Boolean(merged.over);
    merged.wrap = Boolean(merged.wrap);
    merged.speed = ["slow", "normal", "fast"].includes(merged.speed) ? merged.speed : "normal";
    merged.cols = clamp(parseInt(merged.cols, 10) || base.cols, 12, 30);
    merged.rows = clamp(parseInt(merged.rows, 10) || base.rows, 16, 40);
    return merged;
  }

  return base;
}

function speedMs(speed) {
  if (speed === "slow") return 160;
  if (speed === "fast") return 78;
  return 110; // normal
}

function dirVec(d) {
  if (d === "U") return { x: 0, y: -1 };
  if (d === "D") return { x: 0, y: 1 };
  if (d === "L") return { x: -1, y: 0 };
  return { x: 1, y: 0 }; // R
}

function isOpposite(a, b) {
  return (a === "U" && b === "D") || (a === "D" && b === "U") || (a === "L" && b === "R") || (a === "R" && b === "L");
}

function sameCell(a, b) {
  return a.x === b.x && a.y === b.y;
}

function anyHit(snake, cell) {
  return snake.some((p) => sameCell(p, cell));
}

function spawnFood(rng, cols, rows, snake) {
  // Try a bunch of random spots then fallback scan.
  for (let i = 0; i < 300; i++) {
    const c = { x: Math.floor(rng() * cols), y: Math.floor(rng() * rows) };
    if (!anyHit(snake, c)) return c;
  }
  for (let y = 0; y < rows; y++) for (let x = 0; x < cols; x++) {
    const c = { x, y };
    if (!anyHit(snake, c)) return c;
  }
  return { x: 0, y: 0 };
}

export default {
  _ac: null,
  _root: null,
  _ctx: null,

  _raf: 0,
  _lastT: 0,
  _acc: 0,

  _canvas: null,
  _g: null,

  _rng: null,
  _state: null,

  init(ctx) {
    return this.mount(ctx.root, ctx);
  },

  async mount(root, ctx) {
    this._root = root;
    this._ctx = ctx;

    clear(root);

    this._ac = new AbortController();
    const { signal } = this._ac;

    const ui = ctx.ui;
    const storage = ctx.storage;

    this._rng = seededRandForSession();
    this._state = makeInitialState(load());
    const state = this._state;

    // If restored food overlaps snake (or out of bounds), fix it.
    state.food = spawnFood(this._rng, state.cols, state.rows, state.snake);

    // Controls (Frame)
    const speedSelect = el("select", { class: "po-select", "aria-label": "Select speed" }, [
      el("option", { value: "slow", text: "Slow" }),
      el("option", { value: "normal", text: "Normal" }),
      el("option", { value: "fast", text: "Fast" }),
    ]);
    speedSelect.value = state.speed;

    const wrapToggle = el("button", { class: "po-btn", type: "button" }, [state.wrap ? "Wrap: On" : "Wrap: Off"]);
    const pauseBtn = el("button", { class: "po-btn po-btn--primary", type: "button" }, [state.paused ? "Resume" : "Pause"]);
    const restartBtn = el("button", { class: "po-btn", type: "button" }, ["Restart"]);
    const clearBtn = el("button", { class: "po-btn po-btn--ghost", type: "button" }, ["Clear Save"]);

    const controlsRow = el("div", { class: "po-pillrow" }, [speedSelect, wrapToggle, pauseBtn, restartBtn, clearBtn]);
    ui?.setControls?.(controlsRow);

    // HUD + Status
    const setHud = () => {
      ui?.setHUD?.([
        { k: "Score", v: String(state.score) },
        { k: "Best", v: String(state.best) },
        { k: "Speed", v: state.speed },
        { k: "Wrap", v: state.wrap ? "On" : "Off" },
      ]);
    };

    const setStatus = (t) => ui?.setStatus?.(t);

    // Stage
    const wrap = el("div", { class: "po-sn-wrap" });
    const stage = el("div", { class: "po-sn-stage" });
    const canvas = el("canvas", { class: "po-sn-canvas", "aria-label": "Snake canvas", role: "img" });
    const hint = el("div", { class: "po-sn-hint" }, ["Swipe to turn. Tap d-pad if you prefer."]);

    const dpad = el("div", { class: "po-sn-dpad", role: "group", "aria-label": "Direction pad" }, [
      el("button", { class: "po-btn po-sn-dbtn", type: "button", "aria-label": "Up" }, ["↑"]),
      el("div", { class: "po-sn-dmid" }, [
        el("button", { class: "po-btn po-sn-dbtn", type: "button", "aria-label": "Left" }, ["←"]),
        el("button", { class: "po-btn po-sn-dbtn", type: "button", "aria-label": "Down" }, ["↓"]),
        el("button", { class: "po-btn po-sn-dbtn", type: "button", "aria-label": "Right" }, ["→"]),
      ]),
    ]);

    stage.append(canvas);
    wrap.append(stage, dpad, hint);
    root.append(wrap);

    this._canvas = canvas;
    this._g = canvas.getContext("2d", { alpha: true });

    const persist = () => save({
      ...state,
      // keep it lean (no canvas refs)
    });

    const reset = () => {
      const fresh = makeInitialState(null);
      fresh.best = state.best; // carry best unless clear-save
      // keep options chosen
      fresh.speed = state.speed;
      fresh.wrap = state.wrap;
      fresh.cols = state.cols;
      fresh.rows = state.rows;

      Object.assign(state, fresh);
      state.food = spawnFood(this._rng, state.cols, state.rows, state.snake);
      state.status = "New run. Eat to grow.";
      pauseBtn.textContent = "Pause";
      setHud();
      setStatus(state.status);
      persist();
    };

    const hardResetAll = () => {
      clearSave();
      Object.assign(state, makeInitialState(null));
      state.food = spawnFood(this._rng, state.cols, state.rows, state.snake);
      wrapToggle.textContent = state.wrap ? "Wrap: On" : "Wrap: Off";
      speedSelect.value = state.speed;
      pauseBtn.textContent = "Pause";
      setHud();
      setStatus(state.status);
      persist();
    };

    const togglePause = (force) => {
      if (state.over) return;
      state.paused = typeof force === "boolean" ? force : !state.paused;
      pauseBtn.textContent = state.paused ? "Resume" : "Pause";
      state.status = state.paused ? "Paused." : "Back to the chase.";
      setStatus(state.status);
      persist();
    };

    const requestDir = (d) => {
      if (state.over) return;
      if (isOpposite(state.dir, d)) return;
      state.nextDir = d;
    };

    // D-pad wiring (layout: [Up] then row [Left,Down,Right])
    const [upBtn, midRow] = dpad.children;
    const [leftBtn, downBtn, rightBtn] = midRow.children;
    upBtn.addEventListener("click", () => requestDir("U"), { signal });
    leftBtn.addEventListener("click", () => requestDir("L"), { signal });
    downBtn.addEventListener("click", () => requestDir("D"), { signal });
    rightBtn.addEventListener("click", () => requestDir("R"), { signal });

    // Touch swipe
    let sx = 0, sy = 0, st = 0;
    const SWIPE_MIN = 18;
    const SWIPE_MAX_TIME = 550;

    stage.addEventListener("touchstart", (e) => {
      if (!e.touches?.length) return;
      const t = e.touches[0];
      sx = t.clientX; sy = t.clientY; st = Date.now();
    }, { passive: true, signal });

    stage.addEventListener("touchend", (e) => {
      const dt = Date.now() - st;
      if (dt > SWIPE_MAX_TIME) return;

      const t = e.changedTouches?.[0];
      if (!t) return;
      const dx = t.clientX - sx;
      const dy = t.clientY - sy;

      if (Math.abs(dx) < SWIPE_MIN && Math.abs(dy) < SWIPE_MIN) return;

      if (Math.abs(dx) > Math.abs(dy)) requestDir(dx > 0 ? "R" : "L");
      else requestDir(dy > 0 ? "D" : "U");
    }, { passive: true, signal });

    // Keyboard
    window.addEventListener("keydown", (e) => {
      const k = String(e.key || "").toLowerCase();
      if (k === "p" || k === " ") { e.preventDefault(); togglePause(); return; }
      if (k === "arrowup" || k === "w") requestDir("U");
      else if (k === "arrowdown" || k === "s") requestDir("D");
      else if (k === "arrowleft" || k === "a") requestDir("L");
      else if (k === "arrowright" || k === "d") requestDir("R");
      else if (k === "enter") reset();
    }, { signal });

    // Frame controls wiring
    speedSelect.addEventListener("change", () => {
      state.speed = speedSelect.value;
      state.status = `Speed set to ${state.speed}.`;
      setHud();
      setStatus(state.status);
      persist();
    }, { signal });

    wrapToggle.addEventListener("click", () => {
      state.wrap = !state.wrap;
      wrapToggle.textContent = state.wrap ? "Wrap: On" : "Wrap: Off";
      state.status = state.wrap ? "Walls bend. Wrap enabled." : "Walls bite. Wrap disabled.";
      setHud();
      setStatus(state.status);
      persist();
    }, { signal });

    pauseBtn.addEventListener("click", () => togglePause(), { signal });
    restartBtn.addEventListener("click", () => reset(), { signal });
    clearBtn.addEventListener("click", () => hardResetAll(), { signal });

    // Rendering
    const resizeCanvas = () => {
      const rect = stage.getBoundingClientRect();

      // choose a cell size that fits the stage (mobile-first)
      const pad = 14;
      const w = Math.max(240, rect.width - pad);
      const h = Math.max(320, rect.height - pad);

      const cell = Math.floor(Math.min(w / state.cols, h / state.rows));
      const cw = cell * state.cols;
      const ch = cell * state.rows;

      const dpr = Math.max(1, Math.min(2, window.devicePixelRatio || 1));
      canvas.width = Math.floor(cw * dpr);
      canvas.height = Math.floor(ch * dpr);
      canvas.style.width = `${cw}px`;
      canvas.style.height = `${ch}px`;

      const g = this._g;
      g.setTransform(dpr, 0, 0, dpr, 0, 0);

      return { cell, cw, ch };
    };

    let geom = resizeCanvas();
    const ro = new ResizeObserver(() => { geom = resizeCanvas(); draw(); });
    ro.observe(stage);
    signal.addEventListener("abort", () => { try { ro.disconnect(); } catch {} });

    const draw = () => {
      const g = this._g;
      const { cell, cw, ch } = geom;

      g.clearRect(0, 0, cw, ch);

      // soft background grid
      g.globalAlpha = 0.35;
      for (let x = 0; x <= state.cols; x++) {
        g.beginPath();
        g.moveTo(x * cell + 0.5, 0);
        g.lineTo(x * cell + 0.5, ch);
        g.strokeStyle = "rgba(255,255,255,.10)";
        g.stroke();
      }
      for (let y = 0; y <= state.rows; y++) {
        g.beginPath();
        g.moveTo(0, y * cell + 0.5);
        g.lineTo(cw, y * cell + 0.5);
        g.strokeStyle = "rgba(255,255,255,.10)";
        g.stroke();
      }
      g.globalAlpha = 1;

      // food
      g.fillStyle = "rgba(255,255,255,.85)";
      g.beginPath();
      g.roundRect(state.food.x * cell + 3, state.food.y * cell + 3, cell - 6, cell - 6, 10);
      g.fill();

      // snake
      g.fillStyle = "rgba(255,255,255,.18)";
      for (let i = state.snake.length - 1; i >= 0; i--) {
        const p = state.snake[i];
        const inset = i === 0 ? 2 : 4;
        g.beginPath();
        g.roundRect(p.x * cell + inset, p.y * cell + inset, cell - inset * 2, cell - inset * 2, 10);
        g.fill();
      }

      // overlays
      if (state.paused || state.over) {
        g.fillStyle = "rgba(0,0,0,.35)";
        g.fillRect(0, 0, cw, ch);
        g.fillStyle = "rgba(255,255,255,.92)";
        g.font = "700 18px system-ui, -apple-system, Segoe UI, Roboto, Arial";
        g.textAlign = "center";
        g.textBaseline = "middle";
        const msg = state.over ? "Game Over — press Restart" : "Paused — press Resume";
        g.fillText(msg, cw / 2, ch / 2);
      }
    };

    // Update tick
    const step = () => {
      state.dir = state.nextDir;

      const v = dirVec(state.dir);
      const head = state.snake[0];
      let nx = head.x + v.x;
      let ny = head.y + v.y;

      if (state.wrap) {
        nx = (nx + state.cols) % state.cols;
        ny = (ny + state.rows) % state.rows;
      } else {
        if (nx < 0 || nx >= state.cols || ny < 0 || ny >= state.rows) {
          state.over = true;
          state.paused = false;
          state.status = "The sea wall wins. Restart.";
          setStatus(state.status);
          storage?.recordScore?.(state.score);
          persist();
          return;
        }
      }

      const newHead = { x: nx, y: ny };

      // collision with body (allow moving into tail only if it will move away)
      const tail = state.snake[state.snake.length - 1];
      const willEat = sameCell(newHead, state.food);
      const bodyToCheck = willEat ? state.snake : state.snake.slice(0, -1);

      if (anyHit(bodyToCheck, newHead)) {
        state.over = true;
        state.paused = false;
        state.status = "You tangled yourself. Restart.";
        setStatus(state.status);
        storage?.recordScore?.(state.score);
        persist();
        return;
      }

      // move
      state.snake.unshift(newHead);

      if (willEat) {
        state.score += 1;
        if (state.score > state.best) state.best = state.score;
        state.food = spawnFood(this._rng, state.cols, state.rows, state.snake);
        state.status = "Feast. Keep moving.";
        setHud();
        setStatus(state.status);
      } else {
        state.snake.pop();
      }

      persist();
    };

    const loop = (t) => {
      if (!this._lastT) this._lastT = t;
      const dt = t - this._lastT;
      this._lastT = t;

      const ms = speedMs(state.speed);

      if (!state.paused && !state.over) {
        this._acc += dt;
        while (this._acc >= ms) {
          this._acc -= ms;
          step();
          if (state.over) break;
        }
      }

      draw();
      this._raf = requestAnimationFrame(loop);
    };

    // Initial UI paint
    setHud();
    setStatus(state.status);
    persist();

    // Start
    this._raf = requestAnimationFrame(loop);
  },

  destroy() {
    try { this._ac?.abort?.(); } catch {}
    this._ac = null;

    if (this._raf) cancelAnimationFrame(this._raf);
    this._raf = 0;

    this._lastT = 0;
    this._acc = 0;

    try { this._ctx?.ui?.setControls?.(null); } catch {}
    try { this._ctx?.ui?.setStatus?.(""); } catch {}
    try { this._ctx?.ui?.setHUD?.([]); } catch {}

    if (this._root) {
      try { clear(this._root); } catch {}
    }

    this._canvas = null;
    this._g = null;
    this._rng = null;
    this._state = null;

    this._root = null;
    this._ctx = null;
  },

  resize() {
    // Canvas is handled via ResizeObserver.
  },

  pause() {
    if (this._state && !this._state.over) {
      this._state.paused = true;
      this._state.status = "Paused.";
      try { this._ctx?.ui?.setStatus?.(this._state.status); } catch {}
      save(this._state);
    }
  },

  resume() {
    if (this._state && !this._state.over) {
      this._state.paused = false;
      this._state.status = "Back to the chase.";
      try { this._ctx?.ui?.setStatus?.(this._state.status); } catch {}
      save(this._state);
    }
  },
};