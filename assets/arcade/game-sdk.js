import { createRNG } from "./rng.js";
import { dailySeed, newRunSeed } from "./run-seed.js";

export function createGameSDK(ctx, {
  gameId,
  config,
  contentPack,
  ui, // your createGameUI() instance
} = {}) {
  const baseSeed = config?.seedMode === "daily"
    ? dailySeed(gameId)
    : (config?.seed ?? `${gameId}-seed`);

  const rngBase = createRNG(baseSeed);
  const runSeed = newRunSeed(baseSeed, rngBase);
  const rng = createRNG(runSeed);

  const settingsKey = "settings";
  const userSettings = ctx.storage.get(settingsKey, config?.defaultSettings ?? {});
  const setSettings = (patch) => {
    const next = { ...userSettings, ...patch };
    ctx.storage.set(settingsKey, next);
    Object.assign(userSettings, next);
    return next;
  };

  const state = {
    runSeed,
    startedAt: performance.now(),
    paused: false,
    score: 0,
    level: 1,
    lives: config?.lives ?? null,
  };

  function hud(pairs) {
    ui.setHUD([
      { k: "Level", v: state.level },
      { k: "Score", v: state.score },
      ...(state.lives != null ? [{ k: "Lives", v: state.lives }] : []),
      ...pairs,
    ]);
  }

  function randFromTable(table) {
    // table: [{ item, w }, ...]
    const total = table.reduce((s, x) => s + (x.w ?? 1), 0);
    let r = rng.next() * total;
    for (const x of table) {
      r -= (x.w ?? 1);
      if (r <= 0) return x.item;
    }
    return table[table.length - 1]?.item;
  }

  return {
    rng,
    runSeed,
    config,
    contentPack,
    settings: userSettings,
    setSettings,
    state,
    hud,
    toast: ui.toast,
    randFromTable,
  };
}