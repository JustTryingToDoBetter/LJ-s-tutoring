import { el, clear } from "../lib/ui.js";

const WORLD = { w: 320, h: 440 };

function clamp(v, a, b) {
  return Math.max(a, Math.min(b, v));
}

function createInvaders(cols, rows) {
  const invaders = [];
  const padX = 26;
  const padY = 30;
  const gapX = 26;
  const gapY = 22;

  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      invaders.push({
        x: padX + c * gapX,
        y: padY + r * gapY,
        alive: true,
      });
    }
  }
  return invaders;
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
      level: 1,
      paused: false,
      over: false,
      playerX: WORLD.w / 2,
      moveDir: 0,
      fireCooldown: 0,
      invaders: createInvaders(8, 4),
      invaderDir: 1,
      invaderSpeed: 14,
      invaderDrop: 10,
      bullets: [],
      alienShots: [],
    };
    this._state = state;

    const wrap = el("div", { class: "po-inv-wrap" });
    const stage = el("div", { class: "po-inv-stage" });
    const canvas = el("canvas", { class: "po-inv-canvas", role: "img", "aria-label": "Space Invaders" });
    stage.append(canvas);
    wrap.append(stage);
    root.append(wrap);

    const g = canvas.getContext("2d", { alpha: true });

    const setHud = () => {
      ui?.setHUD?.([
        { k: "Score", v: String(state.score) },
        { k: "Lives", v: String(state.lives) },
        { k: "Wave", v: String(state.level) },
      ]);
    };

    const setStatus = (msg) => ui?.setStatus?.(msg);

    const resizeCanvas = () => {
      const rect = stage.getBoundingClientRect();
      const pad = 10;
      const w = Math.max(260, rect.width - pad);
      const h = Math.max(360, rect.height - pad);
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
      mkHold("Left", () => (state.moveDir = -1), () => (state.moveDir = 0)),
      mkHold("Right", () => (state.moveDir = 1), () => (state.moveDir = 0)),
      mkBtn("Fire", () => fire()),
    ]);
    ui?.setControls?.(controlsRow);

    ctx.addEvent(window, "keydown", (e) => {
      if (state.over) return;
      if (e.key === "ArrowLeft" || e.key.toLowerCase() === "a") state.moveDir = -1;
      if (e.key === "ArrowRight" || e.key.toLowerCase() === "d") state.moveDir = 1;
      if (e.key === " " || e.key === "Spacebar") {
        e.preventDefault();
        fire();
      }
    }, { signal });

    ctx.addEvent(window, "keyup", (e) => {
      if (e.key === "ArrowLeft" || e.key.toLowerCase() === "a") state.moveDir = 0;
      if (e.key === "ArrowRight" || e.key.toLowerCase() === "d") state.moveDir = 0;
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
      state.bullets.push({ x: state.playerX, y: WORLD.h - 30, vy: -240 });
      state.fireCooldown = 0.25;
    }

    function spawnAlienShot() {
      const live = state.invaders.filter((i) => i.alive);
      if (!live.length) return;
      const shooter = live[Math.floor(Math.random() * live.length)];
      state.alienShots.push({ x: shooter.x, y: shooter.y + 10, vy: 160 });
    }

    function resetWave() {
      state.invaders = createInvaders(8, 4);
      state.invaderDir = 1;
      state.invaderSpeed = 14 + state.level * 2;
      state.alienShots = [];
      state.bullets = [];
      state.playerX = WORLD.w / 2;
      setStatus("New wave. Hold the line.");
    }

    function update(dt) {
      if (state.paused || state.over) return;

      state.fireCooldown = Math.max(0, state.fireCooldown - dt);
      state.playerX += state.moveDir * 140 * dt;
      state.playerX = clamp(state.playerX, 16, WORLD.w - 16);

      const live = state.invaders.filter((i) => i.alive);
      const speed = state.invaderSpeed + (live.length ? (10 / live.length) * 8 : 0);

      let shift = 0;
      for (const inv of state.invaders) {
        if (!inv.alive) continue;
        inv.x += state.invaderDir * speed * dt;
        if (inv.x < 18 || inv.x > WORLD.w - 18) shift = state.invaderDrop;
      }

      if (shift) {
        state.invaderDir *= -1;
        for (const inv of state.invaders) {
          if (inv.alive) inv.y += shift;
          if (inv.y > WORLD.h - 70) {
            state.over = true;
            state.lives = 0;
            setStatus("The invaders overwhelm you.");
            storage?.recordScore?.(state.score);
          }
        }
      }

      for (const b of state.bullets) b.y += b.vy * dt;
      for (const b of state.alienShots) b.y += b.vy * dt;

      state.bullets = state.bullets.filter((b) => b.y > -20);
      state.alienShots = state.alienShots.filter((b) => b.y < WORLD.h + 20);

      for (const b of state.bullets) {
        for (const inv of state.invaders) {
          if (!inv.alive) continue;
          if (Math.abs(b.x - inv.x) < 12 && Math.abs(b.y - inv.y) < 10) {
            inv.alive = false;
            b.y = -999;
            state.score += 10;
            break;
          }
        }
      }

      for (const s of state.alienShots) {
        if (Math.abs(s.x - state.playerX) < 10 && Math.abs(s.y - (WORLD.h - 22)) < 10) {
          s.y = WORLD.h + 999;
          state.lives -= 1;
          if (state.lives <= 0) {
            state.over = true;
            setStatus("Shield down. Game over.");
            storage?.recordScore?.(state.score);
          }
        }
      }

      if (Math.random() < dt * 0.6) spawnAlienShot();

      if (live.every((i) => !i.alive)) {
        state.level += 1;
        resetWave();
      }

      setHud();
    }

    function draw() {
      const { cw, ch, scale } = geom;
      g.clearRect(0, 0, cw, ch);

      g.save();
      g.scale(scale, scale);

      // backdrop grid
      g.globalAlpha = 0.2;
      g.strokeStyle = "rgba(255,255,255,.2)";
      for (let y = 0; y < WORLD.h; y += 24) {
        g.beginPath();
        g.moveTo(0, y);
        g.lineTo(WORLD.w, y);
        g.stroke();
      }
      g.globalAlpha = 1;

      // player
      g.fillStyle = "rgba(255,255,255,.9)";
      g.fillRect(state.playerX - 12, WORLD.h - 26, 24, 8);
      g.fillRect(state.playerX - 6, WORLD.h - 34, 12, 8);

      // invaders
      for (const inv of state.invaders) {
        if (!inv.alive) continue;
        g.fillStyle = "rgba(60,240,255,.9)";
        g.fillRect(inv.x - 10, inv.y - 7, 20, 14);
        g.fillStyle = "rgba(10,12,18,.8)";
        g.fillRect(inv.x - 6, inv.y - 2, 12, 4);
      }

      // bullets
      g.fillStyle = "rgba(255,255,255,.9)";
      for (const b of state.bullets) g.fillRect(b.x - 1, b.y - 6, 2, 10);

      g.fillStyle = "rgba(255,79,216,.9)";
      for (const s of state.alienShots) g.fillRect(s.x - 1, s.y - 4, 2, 8);

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
    setStatus("Defend the beacon.");

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
