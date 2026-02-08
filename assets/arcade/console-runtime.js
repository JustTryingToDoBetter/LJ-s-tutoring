import {
  createArcadeStore,
  createAudioManager,
  createInputManager,
  createSettingsStore,
  createStorageManager,
  prefersReducedMotion,
} from "/assets/arcade/sdk-core.js";
import { initAdManager } from "/assets/arcade/ad-manager.js";
import { createModal } from "/assets/arcade/ui/Modal.js";
import { createSettingsPanel } from "/assets/arcade/ui/SettingsPanel.js";
import { createToastManager } from "/assets/arcade/ui/Toast.js";
import { createGameContext } from "/arcade/game-runtime.js";

const LS_RECENT = "po_arcade_recent_games";
const LS_STATS = "po_arcade_stats_v1";

function readJson(key) {
  try {
    const raw = localStorage.getItem(key);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

function writeJson(key, value) {
  try { localStorage.setItem(key, JSON.stringify(value)); } catch {}
}

function loadStatsStore() {
  return readJson(LS_STATS) || { games: {} };
}

function saveStatsStore(store) {
  writeJson(LS_STATS, store);
}

function recordRecentGame(gameId) {
  const recent = readJson(LS_RECENT) || [];
  const next = [gameId, ...recent.filter((x) => x !== gameId)].slice(0, 6);
  writeJson(LS_RECENT, next);

  const store = loadStatsStore();
  const now = Date.now();
  const cur = store.games[gameId] || { plays: 0, lastPlayed: null };
  store.games[gameId] = {
    plays: (cur.plays || 0) + 1,
    lastPlayed: now,
  };
  saveStatsStore(store);
}

function legacyKeysFor(gameId) {
  return [
    `po_arcade_${gameId}_v1`,
    `po_arcade_${gameId}_v2`,
    `po_arcade_${gameId}_v3`,
    `po_arcade_${gameId}_v4`,
    `po_arcade_${gameId}`,
  ];
}

export function createConsoleRuntime({ gameId, mountEl, surfaceEl, page }) {
  if (!gameId) throw new Error("createConsoleRuntime: gameId is required");
  if (!mountEl) throw new Error("createConsoleRuntime: mountEl is required");
  if (!surfaceEl) throw new Error("createConsoleRuntime: surfaceEl is required");

  const emitArcadeEvent = (name, detail = {}) => {
    try {
      window.dispatchEvent(new CustomEvent(name, { detail }));
    } catch {}
  };

  const ctx = createGameContext({ root: mountEl, gameId });
  const store = createArcadeStore();
  const settingsStore = createSettingsStore();
  const audio = createAudioManager(settingsStore);
  const storage = createStorageManager(store, gameId, { legacyKeys: legacyKeysFor(gameId) });
  const input = createInputManager(ctx);
  const toastManager = createToastManager(surfaceEl);

  const adManager = initAdManager({ apiBase: "" });
  adManager.bindGameEvents();
  adManager.setGameState({ active: true, gameId });
  emitArcadeEvent("arcade:game:start", { gameId, source: "console" });

  ctx.ui = {
    setHUD: (chips) => page?.setHUD?.(chips),
    setControls: (node) => page?.setControls?.(node),
    setStatus: (text) => page?.setStatus?.(text),
    showToast: (msg, ms) => toastManager.show(msg, ms),
    showModal: ({ title, body, content, actions, onClose, closeOnBackdrop } = {}) => {
      const modal = createModal({
        title: title || "",
        body,
        content,
        actions: actions || [],
        onClose,
        closeOnBackdrop,
      });
      surfaceEl.append(modal.root);
      return modal;
    },
  };

  ctx.store = store;
  ctx.audio = audio;
  ctx.storage = storage;
  ctx.settings = settingsStore;
  ctx.input = input;
  ctx.prefs = { reducedMotion: settingsStore.get().reducedMotion ?? prefersReducedMotion() };
  ctx.emitGameEvent = (eventName, detail = {}) => emitArcadeEvent(eventName, { gameId, ...detail });

  ctx.onCleanup(() => toastManager.destroy());

  recordRecentGame(gameId);
  storage.recordPlay();

  const showSettings = () => {
    const settings = settingsStore.get();
    const apply = (patch) => {
      if (Object.prototype.hasOwnProperty.call(patch, "mute")) audio.setMute(patch.mute);
      if (Object.prototype.hasOwnProperty.call(patch, "sfxVolume")) audio.setSfxVolume(patch.sfxVolume);
      if (Object.prototype.hasOwnProperty.call(patch, "musicVolume")) audio.setMusicVolume(patch.musicVolume);
      if (Object.prototype.hasOwnProperty.call(patch, "reducedMotion")) {
        settingsStore.set({ reducedMotion: patch.reducedMotion });
        ctx.prefs.reducedMotion = patch.reducedMotion;
      }
    };

    const panel = createSettingsPanel({ settings, onChange: apply });
    return ctx.ui.showModal({
      title: "Settings",
      content: panel.panel,
      actions: [{ label: "Done", primary: true }],
    });
  };

  return { ctx, showSettings };
}
