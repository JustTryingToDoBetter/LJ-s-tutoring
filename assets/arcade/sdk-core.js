import { loadState, saveState } from "../lib/storage.js";

const AUDIO_KEY = "po_arcade_audio_v1";

export function createArcadeStore() {
  let state = loadState();

  const save = () => {
    try { saveState(state); } catch {}
  };

  const get = () => state;

  const set = (next) => {
    state = next;
    save();
    return state;
  };

  const updateGame = (gameId, updater) => {
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
    save();
    return state;
  };

  return { get, set, save, updateGame };
}

export function createGameLoop({ step, render, fixedMs = 16.67 } = {}) {
  let running = false;
  let paused = false;
  let last = 0;
  let acc = 0;
  let rafId = 0;

  const tick = (t) => {
    if (!running) return;
    if (!last) last = t;
    const dt = t - last;
    last = t;

    if (!paused) {
      acc += dt;
      while (acc >= fixedMs) {
        step?.(fixedMs);
        acc -= fixedMs;
      }
    }

    render?.(t);
    rafId = requestAnimationFrame(tick);
  };

  return {
    start() {
      if (running) return;
      running = true;
      paused = false;
      last = 0;
      acc = 0;
      rafId = requestAnimationFrame(tick);
    },
    stop() {
      running = false;
      if (rafId) cancelAnimationFrame(rafId);
    },
    pause() { paused = true; },
    resume() { paused = false; },
    get running() { return running; },
    get paused() { return paused; },
  };
}

export function createInputManager(ctx, { target = window } = {}) {
  const bindings = new Map();
  let enabled = true;

  const onKey = (e) => {
    if (!enabled) return;
    const key = String(e.key || "").toLowerCase();
    const handler = bindings.get(key);
    if (handler) handler(e);
  };

  ctx.addEvent(target, "keydown", onKey, { passive: true });

  return {
    bind(key, handler) {
      bindings.set(String(key).toLowerCase(), handler);
    },
    unbind(key) {
      bindings.delete(String(key).toLowerCase());
    },
    clear() {
      bindings.clear();
    },
    setEnabled(next) {
      enabled = Boolean(next);
    },
  };
}

export function createAudioManager() {
  let settings = { mute: false, volume: 0.7 };
  try {
    const raw = localStorage.getItem(AUDIO_KEY);
    if (raw) settings = { ...settings, ...JSON.parse(raw) };
  } catch {}

  const persist = () => {
    try { localStorage.setItem(AUDIO_KEY, JSON.stringify(settings)); } catch {}
  };

  return {
    get mute() { return settings.mute; },
    get volume() { return settings.volume; },
    setMute(mute) { settings.mute = Boolean(mute); persist(); },
    setVolume(volume) {
      const v = Math.max(0, Math.min(1, Number(volume)));
      if (Number.isFinite(v)) settings.volume = v;
      persist();
    },
  };
}

export function prefersReducedMotion() {
  return Boolean(window?.matchMedia?.("(prefers-reduced-motion: reduce)")?.matches);
}
