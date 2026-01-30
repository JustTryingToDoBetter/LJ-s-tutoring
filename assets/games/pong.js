/**
 * Pong — "Aegean Rally" (Module lifecycle version)
 * - Shared Game Frame (ctx.ui)
 * - AbortController cleanup (events)
 * - Mobile-first: drag/touch paddle, keyboard support
 * - 1P vs AI or 2P local
 * - Pause/Resume, difficulty, local best (wins)
 */

import { el, clear } from "../lib/ui.js";
import { dayKey, hashStringToSeed, seededRng } from "../lib/rng.js";

const STORAGE_KEY = "po_arcade_pong_v3";

const load = () => { try { return JSON.parse(localStorage.getItem(STORAGE_KEY) || "null"); } catch { return null; } };
const save = (s) => { try { localStorage.setItem(STORAGE_KEY, JSON.stringify(s)); } catch {} };
const clearSave = () => { try { localStorage.removeItem(STORAGE_KEY); } catch {} };

const clamp = (v, a, b) => Math.max(a, Math.min(b, v));

function seededRandForSession() {
  const seed = `po-pong-${dayKey()}-${Date.now()}-${Math.random()}`;
  return seededRng(hashStringToSeed(seed));
}

function speedCfg(diff) {
  // Smaller dt -> faster action. We'll apply via velocities directly.
  if (diff === "easy") return { ai: 0.08, ball: 560, maxBall: 860 };
  if (diff === "hard") return { ai: 0.18, ball: 690, maxBall: 980 };
  return { ai: 0.12, ball: 620, maxBall: 920 }; // normal
}

function freshState() {
  return {
    v: 3,
    mode: "ai",      // ai | friend
    diff: "normal",  // easy | normal | hard
    paused: false,
    bestWins: 0,     // local best wins (player1)
    wins1: 0,
    wins2: 0,
    status: "Drag to move. First to 7 wins.",
  };
}

export default {
  _ac: null,
  _root: null,
  _ctx: null,

  _raf: 0,
  _lastT: 0,

  _canvas: null,
  _g: null,

  _rng: null,
  _state: null,

  async mount(root, ctx) {
    this._root = root;
    this._ctx = ctx;

    clear(root);

    this._ac = new AbortController();
    const { signal } = this._ac;

    const ui = ctx.ui;

    this._rng = seededRandForSession();

    const restored = load();
    this._state = restored?.v === 3 ? { ...freshState(), ...restored } : freshState();
    const state = this._state;

    state.mode = state.mode === "friend" ? "friend" : "ai";
    state.diff = ["easy", "normal", "hard"].includes(state.diff) ? state.diff : "normal";
    state.paused = Boolean(state.paused);
    state.bestWins = Number.isFinite(state.bestWins) ? state.bestWins : 0;
    state.wins1 = Number.isFinite(state.wins1) ? state.wins1 : 0;
    state.wins2 = Number.isFinite(state.wins2) ? state.wins2 : 0;

    const persist = () => save(state);

    // Controls (Frame)
    const modeSelect = el("select", { class: "po-select", "aria-label": "Select Pong mode" }, [
      el("option", { value: "ai", text: "1P vs AI" }),
      el("option", { value: "friend", text: "2P Local" }),
    ]);
    modeSelect.value = state.mode;

    const diffSelect = el("select", { class: "po-select", "aria-label": "Select difficulty" }, [
      el("option", { value: "easy", text: "Easy" }),
      el("option", { value: "normal", text: "Normal" }),
      el("option", { value: "hard", text: "Hard" }),
    ]);
    diffSelect.value = state.diff;

    const pauseBtn = el("button", { class: "po-btn po-btn--primary", type: "button" }, [state.paused ? "Resume" : "Pause"]);
    const serveBtn = el("button", { class: "po-btn", type: "button" }, ["Serve"]);
    const resetBtn = el("button", { class: "po-btn", type: "button" }, ["Reset Match"]);
    const clearBtn = el("button", { class: "po-btn po-btn--ghost", type: "button" }, ["Clear Save"]);

    const controlsRow = el("div", { class: "po-pillrow" }, [modeSelect, diffSelect, pauseBtn, serveBtn, resetBtn, clearBtn]);
    ui?.setControls?.(controlsRow);

    // Stage
    const wrap = el("div", { class: "po-pg-wrap" });
    const stage = el("div", { class: "po-pg-stage" });
    const canvas = el("canvas", { class: "po-pg-canvas", "aria-label": "Pong canvas", role: "img" });
    const hint = el("div", { class: "po-pg-hint" }, ["Drag paddles. P toggles pause. 2P: W/S and ↑/↓."]);

    stage.append(canvas);
    wrap.append(stage, hint);
    root.append(wrap);

    this._canvas = canvas;
    this._g = canvas.getContext("2d", { alpha: true });

    // Geometry + world units (pixels)
    const WORLD = {
      w: 780,
      h: 520,
      padW: 12,
      padH: 92,
      ballR: 9,
      goalToWin: 7,
    };

    const sim = {
      p1y: WORLD.h / 2,
      p2y: WORLD.h / 2,
      p1vy: 0,
      p2vy: 0,
      ball: { x: WORLD.w / 2, y: WORLD.h / 2, vx: 0, vy: 0 },
      inPlay: false,
      lastHit: null, // "p1" | "p2"
    };

    const setHud = () => {
      ui?.setHUD?.([
        { k: "P1", v: String(state.wins1) },
        { k: "P2", v: String(state.wins2) },
        { k: "Best", v: String(state.bestWins) },
        { k: "Mode", v: state.mode === "ai" ? "AI" : "2P" },
      ]);
    };

    const setStatus = (t) => ui?.setStatus?.(t);

    const resetRally = (serveTo = "p1") => {
      const dir = serveTo === "p1" ? 1 : -1;

      sim.p1y = clamp(sim.p1y, WORLD.padH / 2, WORLD.h - WORLD.padH / 2);
      sim.p2y = clamp(sim.p2y, WORLD.padH / 2, WORLD.h - WORLD.padH / 2);

      sim.ball.x = WORLD.w / 2;
      sim.ball.y = WORLD.h / 2;

      const cfg = speedCfg(state.diff);
      const angle = (this._rng() * 0.55 - 0.275); // -0.275..+0.275 rad-ish
      const base = cfg.ball;

      sim.ball.vx = Math.cos(angle) * base * dir;
      sim.ball.vy = Math.sin(angle) * base;

      sim.inPlay = true;
      sim.lastHit = null;

      state.status = "Rally!";
      setStatus(state.status);
      persist();
    };

    const resetMatch = () => {
      state.wins1 = 0;
      state.wins2 = 0;
      state.paused = false;

      sim.p1y = WORLD.h / 2;
      sim.p2y = WORLD.h / 2;
      sim.p1vy = 0;
      sim.p2vy = 0;
      sim.ball = { x: WORLD.w / 2, y: WORLD.h / 2, vx: 0, vy: 0 };
      sim.inPlay = false;
      sim.lastHit = null;

      pauseBtn.textContent = "Pause";
      setHud();
      state.status = "Ready. Press Serve.";
      setStatus(state.status);
      persist();
    };

    const hardResetAll = () => {
      clearSave();
      Object.assign(state, freshState());
      modeSelect.value = state.mode;
      diffSelect.value = state.diff;
      resetMatch();
      state.bestWins = 0;
      setHud();
      persist();
    };

    const togglePause = (force) => {
      state.paused = typeof force === "boolean" ? force : !state.paused;
      pauseBtn.textContent = state.paused ? "Resume" : "Pause";
      state.status = state.paused ? "Paused." : "Back in play.";
      setStatus(state.status);
      persist();
    };

    // Canvas sizing (responsive)
    const resizeCanvas = () => {
      const rect = stage.getBoundingClientRect();
      const pad = 12;
      const maxW = Math.max(280, rect.width - pad);
      const targetW = Math.min(maxW, 820);
      const targetH = Math.floor(targetW * (WORLD.h / WORLD.w));

      const dpr = Math.max(1, Math.min(2, window.devicePixelRatio || 1));
      canvas.width = Math.floor(targetW * dpr);
      canvas.height = Math.floor(targetH * dpr);
      canvas.style.width = `${targetW}px`;
      canvas.style.height = `${targetH}px`;

      const g = this._g;
      g.setTransform(dpr, 0, 0, dpr, 0, 0);

      return { cw: targetW, ch: targetH, sx: targetW / WORLD.w, sy: targetH / WORLD.h };
    };

    let geom = resizeCanvas();
    const ro = new ResizeObserver(() => { geom = resizeCanvas(); draw(); });
    ro.observe(stage);
    signal.addEventListener("abort", () => { try { ro.disconnect(); } catch {} });

    // Input mapping: pointer drag -> paddle y
    const pickPaddleFromX = (x) => (x < geom.cw / 2 ? "p1" : "p2");
    const setPaddleY = (who, y) => {
      const yy = clamp(y, WORLD.padH / 2, WORLD.h - WORLD.padH / 2);
      if (who === "p1") sim.p1y = yy;
      else sim.p2y = yy;
    };

    const stageToWorldY = (clientY) => {
      const r = canvas.getBoundingClientRect();
      const y = clientY - r.top;
      return clamp(y / geom.sy, 0, WORLD.h);
    };

    const stageToWorldX = (clientX) => {
      const r = canvas.getBoundingClientRect();
      const x = clientX - r.left;
      return clamp(x / geom.sx, 0, WORLD.w);
    };

    let dragging = null; // "p1" | "p2"
    stage.addEventListener("pointerdown", (e) => {
      canvas.setPointerCapture?.(e.pointerId);
      const wx = stageToWorldX(e.clientX);
      dragging = pickPaddleFromX(wx * geom.sx);
      const wy = stageToWorldY(e.clientY);
      if (state.mode === "ai" && dragging === "p2") dragging = "p1";
      setPaddleY(dragging, wy);
    }, { signal });

    stage.addEventListener("pointermove", (e) => {
      if (!dragging) return;
      const wy = stageToWorldY(e.clientY);
      setPaddleY(dragging, wy);
    }, { signal });

    stage.addEventListener("pointerup", () => { dragging = null; }, { signal });
    stage.addEventListener("pointercancel", () => { dragging = null; }, { signal });

    // Keyboard controls
    const keys = new Set();
    window.addEventListener("keydown", (e) => {
      const k = String(e.key || "");
      if (k === " " || k.toLowerCase() === "p") { e.preventDefault(); togglePause(); return; }
      if (k === "Enter") { if (!sim.inPlay && !state.paused) resetRally("p1"); return; }
      keys.add(k);
    }, { signal });

    window.addEventListener("keyup", (e) => {
      keys.delete(String(e.key || ""));
    }, { signal });

    // Frame control wiring
    modeSelect.addEventListener("change", () => {
      state.mode = modeSelect.value === "friend" ? "friend" : "ai";
      state.status = state.mode === "ai" ? "1P vs AI. Press Serve." : "2P local. Press Serve.";
      setHud();
      setStatus(state.status);
      resetMatch();
      persist();
    }, { signal });

    diffSelect.addEventListener("change", () => {
      state.diff = diffSelect.value;
      state.status = `Difficulty: ${state.diff}.`;
      setStatus(state.status);
      persist();
    }, { signal });

    pauseBtn.addEventListener("click", () => togglePause(), { signal });
    serveBtn.addEventListener("click", () => {
      if (state.paused) return;
      if (!sim.inPlay) resetRally("p1");
    }, { signal });

    resetBtn.addEventListener("click", () => resetMatch(), { signal });
    clearBtn.addEventListener("click", () => hardResetAll(), { signal });

    // Physics helpers
    const paddleX1 = 24;
    const paddleX2 = WORLD.w - 24;

    const bounceOffPaddle = (who) => {
      const b = sim.ball;

      // where on paddle did it hit? (-1..1)
      const py = who === "p1" ? sim.p1y : sim.p2y;
      const rel = clamp((b.y - py) / (WORLD.padH / 2), -1, 1);

      const cfg = speedCfg(state.diff);

      // speed increases slightly
      const cur = Math.hypot(b.vx, b.vy);
      const nextSpeed = Math.min(cfg.maxBall, cur * 1.04 + 6);

      // angle from rel, more extreme at edges
      const angle = rel * 0.95; // radians-ish
      const dir = who === "p1" ? 1 : -1;

      b.vx = Math.cos(angle) * nextSpeed * dir;
      b.vy = Math.sin(angle) * nextSpeed;

      sim.lastHit = who;
    };

    const scorePoint = (winner) => {
      sim.inPlay = false;
      sim.ball.vx = 0;
      sim.ball.vy = 0;

      if (winner === "p1") state.wins1 += 1;
      else state.wins2 += 1;

      if (state.wins1 > state.bestWins) state.bestWins = state.wins1;

      setHud();

      const done1 = state.wins1 >= WORLD.goalToWin;
      const done2 = state.wins2 >= WORLD.goalToWin;

      if (done1 || done2) {
        state.status = done1 ? "P1 wins the match!" : "P2 wins the match!";
        setStatus(state.status);
        persist();
        return;
      }

      state.status = `${winner.toUpperCase()} scores. Press Serve.`;
      setStatus(state.status);
      persist();
    };

    const draw = () => {
      const g = this._g;
      const { cw, ch, sx, sy } = geom;

      g.clearRect(0, 0, cw, ch);

      // background grid
      g.globalAlpha = 0.30;
      for (let y = 0; y <= WORLD.h; y += 26) {
        g.beginPath();
        g.moveTo(0, y * sy + 0.5);
        g.lineTo(cw, y * sy + 0.5);
        g.strokeStyle = "rgba(255,255,255,.10)";
        g.stroke();
      }
      g.globalAlpha = 1;

      // center dashed line
      g.globalAlpha = 0.45;
      for (let y = 10; y < WORLD.h; y += 22) {
        g.fillStyle = "rgba(255,255,255,.18)";
        g.fillRect((WORLD.w / 2) * sx - 2, y * sy, 4, 12 * sy);
      }
      g.globalAlpha = 1;

      // paddles
      g.fillStyle = "rgba(255,255,255,.18)";
      const p1y = (sim.p1y - WORLD.padH / 2) * sy;
      const p2y = (sim.p2y - WORLD.padH / 2) * sy;

      g.beginPath();
      g.roundRect((paddleX1 - WORLD.padW / 2) * sx, p1y, WORLD.padW * sx, WORLD.padH * sy, 12);
      g.fill();

      g.beginPath();
      g.roundRect((paddleX2 - WORLD.padW / 2) * sx, p2y, WORLD.padW * sx, WORLD.padH * sy, 12);
      g.fill();

      // ball
      g.fillStyle = "rgba(255,255,255,.88)";
      g.beginPath();
      g.arc(sim.ball.x * sx, sim.ball.y * sy, WORLD.ballR * Math.min(sx, sy), 0, Math.PI * 2);
      g.fill();

      // overlay messages
      if (state.paused) {
        g.fillStyle = "rgba(0,0,0,.35)";
        g.fillRect(0, 0, cw, ch);
        g.fillStyle = "rgba(255,255,255,.92)";
        g.font = "700 18px system-ui, -apple-system, Segoe UI, Roboto, Arial";
        g.textAlign = "center";
        g.textBaseline = "middle";
        g.fillText("Paused — press Resume", cw / 2, ch / 2);
      } else if (!sim.inPlay) {
        g.fillStyle = "rgba(0,0,0,.22)";
        g.fillRect(0, 0, cw, ch);
        g.fillStyle = "rgba(255,255,255,.90)";
        g.font = "700 18px system-ui, -apple-system, Segoe UI, Roboto, Arial";
        g.textAlign = "center";
        g.textBaseline = "middle";
        g.fillText("Press Serve", cw / 2, ch / 2);
      }
    };

    const update = (dt) => {
      // keyboard input -> velocity intentions
      const pSpeed = 820; // px/sec (world)
      let p1 = 0, p2 = 0;

      // P1: W/S or ArrowUp/ArrowDown (also allow on 1P)
      if (keys.has("w") || keys.has("W")) p1 -= 1;
      if (keys.has("s") || keys.has("S")) p1 += 1;
      if (keys.has("ArrowUp")) p1 -= 1;
      if (keys.has("ArrowDown")) p1 += 1;

      // P2: only in friend mode: I/K or ArrowUp/ArrowDown? (we’ll use I/K)
      if (state.mode === "friend") {
        if (keys.has("i") || keys.has("I")) p2 -= 1;
        if (keys.has("k") || keys.has("K")) p2 += 1;
      }

      sim.p1y = clamp(sim.p1y + p1 * pSpeed * dt, WORLD.padH / 2, WORLD.h - WORLD.padH / 2);
      sim.p2y = clamp(sim.p2y + p2 * pSpeed * dt, WORLD.padH / 2, WORLD.h - WORLD.padH / 2);

      // AI (moves paddle 2)
      if (state.mode === "ai") {
        const cfg = speedCfg(state.diff);
        const target = sim.ball.y;
        const err = target - sim.p2y;
        sim.p2y += err * cfg.ai; // smoothing factor (frame-rate independent-ish)
        sim.p2y = clamp(sim.p2y, WORLD.padH / 2, WORLD.h - WORLD.padH / 2);
      }

      if (!sim.inPlay) return;

      const b = sim.ball;
      b.x += b.vx * dt;
      b.y += b.vy * dt;

      // top/bottom bounce
      if (b.y - WORLD.ballR < 0) { b.y = WORLD.ballR; b.vy *= -1; }
      if (b.y + WORLD.ballR > WORLD.h) { b.y = WORLD.h - WORLD.ballR; b.vy *= -1; }

      // paddle collision boxes
      const p1Top = sim.p1y - WORLD.padH / 2;
      const p1Bot = sim.p1y + WORLD.padH / 2;
      const p2Top = sim.p2y - WORLD.padH / 2;
      const p2Bot = sim.p2y + WORLD.padH / 2;

      // hit p1
      if (b.vx < 0 && b.x - WORLD.ballR <= paddleX1 + WORLD.padW / 2) {
        if (b.y >= p1Top - 4 && b.y <= p1Bot + 4) {
          b.x = paddleX1 + WORLD.padW / 2 + WORLD.ballR + 0.5;
          bounceOffPaddle("p1");
        }
      }

      // hit p2
      if (b.vx > 0 && b.x + WORLD.ballR >= paddleX2 - WORLD.padW / 2) {
        if (b.y >= p2Top - 4 && b.y <= p2Bot + 4) {
          b.x = paddleX2 - WORLD.padW / 2 - WORLD.ballR - 0.5;
          bounceOffPaddle("p2");
        }
      }

      // goal
      if (b.x < -40) scorePoint("p2");
      if (b.x > WORLD.w + 40) scorePoint("p1");
    };

    const loop = (t) => {
      if (!this._lastT) this._lastT = t;
      const dt = Math.min(0.033, (t - this._lastT) / 1000);
      this._lastT = t;

      if (!state.paused) update(dt);

      draw();
      this._raf = requestAnimationFrame(loop);
    };

    // Init
    setHud();
    setStatus(state.status);
    persist();
    resetMatch();
    this._raf = requestAnimationFrame(loop);
  },

  destroy() {
    try { this._ac?.abort?.(); } catch {}
    this._ac = null;

    if (this._raf) cancelAnimationFrame(this._raf);
    this._raf = 0;

    this._lastT = 0;

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

  resize() {},

  pause() {
    if (this._state) {
      this._state.paused = true;
      try { this._ctx?.ui?.setStatus?.("Paused."); } catch {}
      save(this._state);
    }
  },

  resume() {
    if (this._state) {
      this._state.paused = false;
      try { this._ctx?.ui?.setStatus?.("Back in play."); } catch {}
      save(this._state);
    }
  },
};