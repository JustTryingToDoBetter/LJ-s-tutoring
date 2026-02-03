/**
 * game-runtime.js
 * Production lifecycle manager for Project Odysseus Arcade.
 *
 * Guarantees:
 * - One active game at a time
 * - Consistent init/resize/pause/resume/destroy flow
 * - Automatic cleanup of events, timers, RAF, observers, and AbortController listeners
 */

function safeCall(fn, ...args) {
  try { return fn?.(...args); } catch (e) { console.error(e); }
}

function isObj(v) { return v && typeof v === "object"; }

export function createGameContext({ root, gameId }) {
  const cleanups = new Set();
  const controller = new AbortController();
  const { signal } = controller;

  // --- cleanup registration ------------------------------------------------
  const onCleanup = (fn) => {
    if (typeof fn !== "function") return () => {};
    cleanups.add(fn);
    return () => cleanups.delete(fn);
  };

  const cleanupAll = () => {
    // Stop new work first.
    controller.abort();

    // Run in reverse-ish order (best-effort).
    const fns = Array.from(cleanups);
    cleanups.clear();
    for (let i = fns.length - 1; i >= 0; i--) safeCall(fns[i]);
  };

  // --- event helper (auto removed) ----------------------------------------
  const addEvent = (target, type, handler, options = {}) => {
    if (!target?.addEventListener) return () => {};
    // Auto-abort support:
    const opts = isObj(options) ? { ...options, signal } : options;
    target.addEventListener(type, handler, opts);
    const off = () => {
      try { target.removeEventListener(type, handler, options); } catch {}
    };
    return onCleanup(off);
  };

  // --- timers --------------------------------------------------------------
  const timeout = (fn, ms) => {
    const id = setTimeout(fn, ms);
    return onCleanup(() => clearTimeout(id));
  };

  const interval = (fn, ms) => {
    const id = setInterval(fn, ms);
    return onCleanup(() => clearInterval(id));
  };

  // --- requestAnimationFrame ----------------------------------------------
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

  // --- observers -----------------------------------------------------------
  const resizeObserver = (el, cb) => {
    if (!("ResizeObserver" in window)) return () => {};
    const ro = new ResizeObserver(cb);
    ro.observe(el);
    return onCleanup(() => ro.disconnect());
  };

  // --- DOM helpers ----------------------------------------------------------
  const clearRoot = () => {
    while (root.firstChild) root.removeChild(root.firstChild);
  };

  // Namespaced storage (handy for scores/settings)
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

    // lifecycle
    signal,
    onCleanup,
    cleanupAll,
    clearRoot,

    // utilities
    addEvent,
    timeout,
    interval,
    raf,
    resizeObserver,
    storage,
  };
}

export function createGameRuntime({ mountEl, onStateChange, createContext } = {}) {
  if (!mountEl) throw new Error("createGameRuntime: mountEl is required");

  let active = null; // { game, ctx, id }
  let visibilityBound = false;

  const setState = (patch) => {
    onStateChange?.(patch);
  };

  const ensureVisibilityHooks = () => {
    if (visibilityBound) return;
    visibilityBound = true;

    document.addEventListener("visibilitychange", () => {
      if (!active) return;
      if (document.hidden) safeCall(active.game.pause, active.ctx);
      else safeCall(active.game.resume, active.ctx);
    });
  };

  const destroyActive = async () => {
    if (!active) return;

    const { game, ctx } = active;
    active = null;

    // Let game do custom teardown first (optional).
    try { await game.destroy?.(ctx); } catch (e) { console.error(e); }

    // Then guarantee everything registered gets cleaned.
    ctx.cleanupAll();

    // Clear mount to prevent “double UI”
    ctx.clearRoot();

    setState({ status: "idle", gameId: null });
  };

  const mountGame = async ({ id, moduleLoader }) => {
    await destroyActive();
    ensureVisibilityHooks();

    setState({ status: "loading", gameId: id });

    // Create a fresh root container per mount (makes CSS/layout isolation easier)
    const root = document.createElement("div");
    root.className = "po-game-root";
    mountEl.innerHTML = "";
    mountEl.appendChild(root);

    const gameModule = await moduleLoader();
    const game = gameModule?.default ?? gameModule?.game;

    if (!game?.init || typeof game.init !== "function") {
      mountEl.innerHTML = "";
      throw new Error(`Game "${id}" does not export a valid contract (missing init).`);
    }

    const ctx = createGameContext({ root, gameId: id });
    if (typeof createContext === "function") {
      const extra = createContext(ctx);
      if (extra && typeof extra === "object") Object.assign(ctx, extra);
    }

    active = { id, game, ctx };
    setState({ status: "running", gameId: id });

    // Optional: automatically call resize on ResizeObserver
    const roOff = ctx.resizeObserver(root, () => safeCall(game.resize, ctx));
    ctx.onCleanup(roOff);

    // Run init
    try {
      await game.init(ctx);
      // Initial resize pass
      safeCall(game.resize, ctx);
      // If page is hidden at mount time, pause immediately
      if (document.hidden) safeCall(game.pause, ctx);
    } catch (e) {
      console.error(e);
      // Ensure we don’t leak if init fails
      await destroyActive();
      throw e;
    }
  };

  const resize = () => {
    if (!active) return;
    safeCall(active.game.resize, active.ctx);
  };

  const pause = () => {
    if (!active) return;
    safeCall(active.game.pause, active.ctx);
  };

  const resume = () => {
    if (!active) return;
    safeCall(active.game.resume, active.ctx);
  };

  return {
    mountGame,
    destroyActive,
    resize,
    pause,
    resume,
    get activeGameId() { return active?.id ?? null; },
  };
}