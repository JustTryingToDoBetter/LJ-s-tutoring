import { el, clear } from "../lib/ui.js";

const WORLD = { w: 360, h: 420 };

function clamp(v, a, b) {
  return Math.max(a, Math.min(b, v));
}

function wrap(v, max) {
  if (v < 0) return v + max;
  if (v > max) return v - max;
  return v;
}

function rand(min, max) {
  return Math.random() * (max - min) + min;
}

function spawnAsteroid(radius) {
  return {
    x: rand(20, WORLD.w - 20),
    y: rand(20, WORLD.h - 120),
    vx: rand(-30, 30),
    vy: rand(20, 60),
    r: radius,
  };
}

export default {
  _ac: null,
  _root: null,
  _ctx: null,
  _raf: 0,
  _lastT: 0,
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

    const state = {
      score: 0,
      lives: 3,
      wave: 1,
      paused: false,
      over: false,
      ship: { x: WORLD.w / 2, y: WORLD.h / 2, vx: 0, vy: 0, angle: -Math.PI / 2 },
      bullets: [],
      asteroids: Array.from({ length: 5 }, () => spawnAsteroid(18)),
      input: { left: false, right: false, thrust: false },
      fireCooldown: 0,
    };
    this._state = state;

    const wrapEl = el("div", { class: "po-ast-wrap" });
    const stage = el("div", { class: "po-ast-stage" });
    const canvas = el("canvas", { class: "po-ast-canvas", role: "img", "aria-label": "Asteroids" });
    stage.append(canvas);
    wrapEl.append(stage);
    root.append(wrapEl);

    const g = canvas.getContext("2d", { alpha: true });

    const setHud = () => {
      ui?.setHUD?.([
        { k: "Score", v: String(state.score) },
        { k: "Lives", v: String(state.lives) },
        { k: "Wave", v: String(state.wave) },
      ]);
    };

    const setStatus = (msg) => ui?.setStatus?.(msg);

    const resizeCanvas = () => {
      const rect = stage.getBoundingClientRect();
      const pad = 10;
      const w = Math.max(260, rect.width - pad);
      const h = Math.max(320, rect.height - pad);
      const scale = Math.min(w / WORLD.w, h / WORLD.h);
      const cw = Math.floor(WORLD.w * scale);
      const ch = Math.floor(WORLD.h * scale);
      const dpr = Math.max(1, Math.min(2, window.devicePixelRatio || 1));

      canvas.width = Math.floor(cw * dpr);
      canvas.height = Math.floor(ch * dpr);
      canvas.style.width = `${cw}px`;
      canvas.style.height = `${ch}px`;
      g.setTransform(dpr, 0, 0, dpr, 0, 0);
      return { scale, cw, ch };
    };

    let geom = resizeCanvas();
    const ro = new ResizeObserver(() => { geom = resizeCanvas(); });
    ro.observe(stage);
    signal.addEventListener("abort", () => { try { ro.disconnect(); } catch {} });

    const controlsRow = el("div", { class: "po-pillrow" }, [
      mkHold("Left", () => (state.input.left = true), () => (state.input.left = false)),
      mkHold("Right", () => (state.input.right = true), () => (state.input.right = false)),
      mkHold("Thrust", () => (state.input.thrust = true), () => (state.input.thrust = false)),
      mkBtn("Fire", () => fire()),
    ]);
    ui?.setControls?.(controlsRow);

    ctx.addEvent(window, "keydown", (e) => {
      if (e.key === "ArrowLeft" || e.key.toLowerCase() === "a") state.input.left = true;
      if (e.key === "ArrowRight" || e.key.toLowerCase() === "d") state.input.right = true;
      if (e.key === "ArrowUp" || e.key.toLowerCase() === "w") state.input.thrust = true;
      if (e.key === " " || e.key === "Spacebar") {
        e.preventDefault();
        fire();
      }
    }, { signal });

    ctx.addEvent(window, "keyup", (e) => {
      if (e.key === "ArrowLeft" || e.key.toLowerCase() === "a") state.input.left = false;
      if (e.key === "ArrowRight" || e.key.toLowerCase() === "d") state.input.right = false;
      if (e.key === "ArrowUp" || e.key.toLowerCase() === "w") state.input.thrust = false;
    }, { signal });

    function mkBtn(label, onClick) {
      return el("button", { class: "po-btn", type: "button", onClick }, [label]);
    }

    function mkHold(label, onDown, onUp) {
      const btn = mkBtn(label, onDown);
      ctx.addEvent(btn, "pointerdown", (e) => {
        e.preventDefault();
        onDown();
      }, { signal });
      ctx.addEvent(btn, "pointerup", () => onUp(), { signal });
      ctx.addEvent(btn, "pointerleave", () => onUp(), { signal });
      return btn;
    }

    function fire() {
      if (state.fireCooldown > 0 || state.paused || state.over) return;
      const speed = 200;
      const bx = state.ship.x + Math.cos(state.ship.angle) * 12;
      const by = state.ship.y + Math.sin(state.ship.angle) * 12;
      state.bullets.push({
        x: bx,
        y: by,
        vx: Math.cos(state.ship.angle) * speed,
        vy: Math.sin(state.ship.angle) * speed,
        life: 1.2,
      });
      state.fireCooldown = 0.25;
    }

    function resetWave() {
      state.asteroids = Array.from({ length: 4 + state.wave }, () => spawnAsteroid(18));
      setStatus("New wave inbound.");
    }

    function update(dt) {
      if (state.paused || state.over) return;

      state.fireCooldown = Math.max(0, state.fireCooldown - dt);

      if (state.input.left) state.ship.angle -= 2.2 * dt;
      if (state.input.right) state.ship.angle += 2.2 * dt;
      if (state.input.thrust) {
        state.ship.vx += Math.cos(state.ship.angle) * 80 * dt;
        state.ship.vy += Math.sin(state.ship.angle) * 80 * dt;
      }

      state.ship.vx *= 0.99;
      state.ship.vy *= 0.99;
      state.ship.x = wrap(state.ship.x + state.ship.vx * dt, WORLD.w);
      state.ship.y = wrap(state.ship.y + state.ship.vy * dt, WORLD.h);

      for (const b of state.bullets) {
        b.x = wrap(b.x + b.vx * dt, WORLD.w);
        b.y = wrap(b.y + b.vy * dt, WORLD.h);
        b.life -= dt;
      }
      state.bullets = state.bullets.filter((b) => b.life > 0);

      for (const a of state.asteroids) {
        a.x = wrap(a.x + a.vx * dt, WORLD.w);
        a.y = wrap(a.y + a.vy * dt, WORLD.h);
      }

      for (const b of state.bullets) {
        for (const a of state.asteroids) {
          const dx = b.x - a.x;
          const dy = b.y - a.y;
          if (dx * dx + dy * dy < a.r * a.r) {
            a.hit = true;
            b.life = 0;
            state.score += 15;
            if (a.r > 12) {
              state.asteroids.push({
                x: a.x,
                y: a.y,
                vx: rand(-60, 60),
                vy: rand(-60, 60),
                r: a.r - 6,
              });
            }
          }
        }
      }
      state.asteroids = state.asteroids.filter((a) => !a.hit);

      for (const a of state.asteroids) {
        const dx = state.ship.x - a.x;
        const dy = state.ship.y - a.y;
        if (dx * dx + dy * dy < (a.r + 8) * (a.r + 8)) {
          state.lives -= 1;
          state.ship.x = WORLD.w / 2;
          state.ship.y = WORLD.h / 2;
          state.ship.vx = 0;
          state.ship.vy = 0;
          if (state.lives <= 0) {
            state.over = true;
            setStatus("Hull breached. Game over.");
            storage?.recordScore?.(state.score);
          }
        }
      }

      if (state.asteroids.length === 0) {
        state.wave += 1;
        resetWave();
      }

      setHud();
    }

    function draw() {
      const { scale, cw, ch } = geom;
      g.clearRect(0, 0, cw, ch);

      g.save();
      g.scale(scale, scale);

      g.globalAlpha = 0.2;
      g.strokeStyle = "rgba(255,255,255,.2)";
      for (let x = 0; x < WORLD.w; x += 24) {
        g.beginPath();
        g.moveTo(x, 0);
        g.lineTo(x, WORLD.h);
        g.stroke();
      }
      g.globalAlpha = 1;

      g.fillStyle = "rgba(255,255,255,.9)";
      g.beginPath();
      g.arc(state.ship.x, state.ship.y, 6, 0, Math.PI * 2);
      g.fill();

      g.strokeStyle = "rgba(255,255,255,.8)";
      g.beginPath();
      g.moveTo(state.ship.x + Math.cos(state.ship.angle) * 10, state.ship.y + Math.sin(state.ship.angle) * 10);
      g.lineTo(state.ship.x + Math.cos(state.ship.angle + 2.5) * 8, state.ship.y + Math.sin(state.ship.angle + 2.5) * 8);
      g.lineTo(state.ship.x + Math.cos(state.ship.angle - 2.5) * 8, state.ship.y + Math.sin(state.ship.angle - 2.5) * 8);
      g.closePath();
      g.stroke();

      g.fillStyle = "rgba(60,240,255,.9)";
      for (const b of state.bullets) {
        g.fillRect(b.x - 1, b.y - 1, 2, 2);
      }

      g.strokeStyle = "rgba(255,79,216,.8)";
      for (const a of state.asteroids) {
        g.beginPath();
        g.arc(a.x, a.y, a.r, 0, Math.PI * 2);
        g.stroke();
      }

      if (state.over) {
        g.fillStyle = "rgba(0,0,0,.45)";
        g.fillRect(0, 0, WORLD.w, WORLD.h);
        g.fillStyle = "rgba(255,255,255,.95)";
        g.font = "700 18px system-ui, -apple-system, Segoe UI, Roboto, Arial";
        g.textAlign = "center";
        g.textBaseline = "middle";
        g.fillText("Game Over", WORLD.w / 2, WORLD.h / 2);
      }

      g.restore();
    }

    setHud();
    setStatus("Drift and survive.");

    const loop = (t) => {
      if (!this._lastT) this._lastT = t;
      const dt = Math.min(0.05, (t - this._lastT) / 1000);
      this._lastT = t;

      update(dt);
      draw();
      this._raf = requestAnimationFrame(loop);
    };

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
    this._root = null;
    this._ctx = null;
    this._state = null;
  },

  pause() {
    if (this._state) this._state.paused = true;
  },
  resume() {
    if (this._state) this._state.paused = false;
  },
  resize() {},
};
