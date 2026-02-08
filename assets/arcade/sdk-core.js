import { loadState, saveState } from "../lib/storage.js";

const AUDIO_KEY = "po_arcade_audio_v1";
const LEGACY_SETTINGS_KEY = "po_arcade_settings_v1";
const SETTINGS_KEY = "odyssey_arcade_settings_v1";

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

export function createInputManager(ctx, { target = window, preventDefault = false } = {}) {
  const bindings = new Map();
  const pressed = new Set();
  let enabled = true;

  const normalize = (k) => String(k || "").toLowerCase();

  const handle = (type, e) => {
    if (!enabled) return;
    const key = normalize(e.key);
    const binding = bindings.get(key);
    if (!binding) return;

    if (binding.preventDefault || preventDefault) {
      try { e.preventDefault(); } catch {}
    }

    if (type === "down") {
      if (pressed.has(key) && !binding.allowRepeat) return;
      pressed.add(key);
      binding.onDown?.(e);
      binding.handler?.(e);
    } else if (type === "up") {
      pressed.delete(key);
      binding.onUp?.(e);
    }
  };

  ctx.addEvent(target, "keydown", (e) => handle("down", e), { passive: !preventDefault });
  ctx.addEvent(target, "keyup", (e) => handle("up", e), { passive: true });
  ctx.addEvent(window, "blur", () => pressed.clear(), { passive: true });
  ctx.addEvent(document, "visibilitychange", () => {
    if (document.hidden) pressed.clear();
  }, { passive: true });

  return {
    bind(key, handlerOrSpec) {
      const k = normalize(key);
      if (typeof handlerOrSpec === "function") {
        bindings.set(k, { handler: handlerOrSpec, allowRepeat: false, preventDefault: false });
      } else {
        bindings.set(k, {
          handler: handlerOrSpec?.handler,
          onDown: handlerOrSpec?.onDown,
          onUp: handlerOrSpec?.onUp,
          allowRepeat: Boolean(handlerOrSpec?.allowRepeat),
          preventDefault: Boolean(handlerOrSpec?.preventDefault),
        });
      }
    },
    unbind(key) {
      bindings.delete(normalize(key));
    },
    clear() {
      bindings.clear();
      pressed.clear();
    },
    releaseAll() {
      pressed.clear();
    },
    isPressed(key) {
      return pressed.has(normalize(key));
    },
    setEnabled(next) {
      enabled = Boolean(next);
      if (!enabled) pressed.clear();
    },
  };
}

export function createSettingsStore() {
  const defaults = {
    mute: false,
    sfxVolume: 0.7,
    musicVolume: 0.5,
    reducedMotion: prefersReducedMotion(),
    crt: false,
  };

  let settings = { ...defaults };

  try {
    const legacy = localStorage.getItem(AUDIO_KEY);
    if (legacy) {
      const parsed = JSON.parse(legacy);
      settings = { ...settings, ...parsed };
      localStorage.removeItem(AUDIO_KEY);
    }
  } catch {}

  try {
    const raw = localStorage.getItem(SETTINGS_KEY);
    if (raw) {
      settings = { ...settings, ...JSON.parse(raw) };
    } else {
      const legacy = localStorage.getItem(LEGACY_SETTINGS_KEY);
      if (legacy) {
        settings = { ...settings, ...JSON.parse(legacy) };
        localStorage.removeItem(LEGACY_SETTINGS_KEY);
      }
    }
  } catch {}

  const persist = () => {
    try { localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings)); } catch {}
  };

  return {
    get() { return { ...settings }; },
    set(patch = {}) {
      settings = { ...settings, ...patch };
      persist();
      return { ...settings };
    },
  };
}

export function createAudioManager(settingsStore = createSettingsStore()) {
  let settings = settingsStore.get();
  const sfxRegistry = new Map();

  const sync = (patch) => {
    settings = settingsStore.set(patch);
    return settings;
  };

  return {
    get mute() { return settings.mute; },
    get sfxVolume() { return settings.sfxVolume; },
    get musicVolume() { return settings.musicVolume; },
    get settings() { return { ...settings }; },
    setMute(mute) { sync({ mute: Boolean(mute) }); },
    setSfxVolume(volume) {
      const v = Math.max(0, Math.min(1, Number(volume)));
      if (Number.isFinite(v)) sync({ sfxVolume: v });
    },
    setMusicVolume(volume) {
      const v = Math.max(0, Math.min(1, Number(volume)));
      if (Number.isFinite(v)) sync({ musicVolume: v });
    },
    registerSfx(name, audio) {
      if (name && audio) sfxRegistry.set(name, audio);
    },
    playSfx(name) {
      if (settings.mute) return;
      const audio = sfxRegistry.get(name);
      if (!audio) return;
      try {
        const node = audio.cloneNode ? audio.cloneNode() : audio;
        node.volume = settings.sfxVolume;
        node.play?.();
      } catch {}
    },
  };
}

export function createStorageManager(store, gameId, { legacyKeys = [] } = {}) {
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

  const migrateLegacy = (g) => {
    let next = { ...g };
    if (Number.isFinite(g.best)) next.bestScore = g.best;
    if (Number.isFinite(g.bestWins)) next.bestScore = g.bestWins;

    for (const key of legacyKeys) {
      try {
        const raw = localStorage.getItem(key);
        if (!raw) continue;
        const legacy = JSON.parse(raw);
        if (Number.isFinite(legacy.best)) next.bestScore = legacy.best;
        if (Number.isFinite(legacy.bestWins)) next.bestScore = legacy.bestWins;
      } catch {}
    }
    return next;
  };

  const getRaw = () => store.get().games?.[gameId] || {};

  return {
    get() {
      return normalize(migrateLegacy(getRaw()));
    },
    update(patch) {
      return store.updateGame(gameId, (g) => normalize({ ...g, ...patch }));
    },
    recordPlay() {
      const now = Date.now();
      return store.updateGame(gameId, (g) => {
        const base = normalize(migrateLegacy(g));
        return { ...base, plays: base.plays + 1, lastPlayed: now };
      });
    },
    recordScore(score) {
      const value = Number(score) || 0;
      return store.updateGame(gameId, (g) => {
        const base = normalize(migrateLegacy(g));
        return { ...base, bestScore: Math.max(base.bestScore, value) };
      });
    },
    setSettings(patch) {
      return store.updateGame(gameId, (g) => {
        const base = normalize(migrateLegacy(g));
        return { ...base, settings: { ...base.settings, ...patch } };
      });
    },
  };
}

export function prefersReducedMotion() {
  return Boolean(window?.matchMedia?.("(prefers-reduced-motion: reduce)")?.matches);
}
