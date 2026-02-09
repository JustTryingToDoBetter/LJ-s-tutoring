const STORAGE_KEY = "po_arcade_ad_state_v2";
const CONFIG_ENDPOINT = "/api/arcade/ad-config";

const DEFAULT_RULES = [
  { placement: "menu_banner", cooldownSeconds: 60, maxPerDay: 1000 },
  { placement: "pause_screen_banner", cooldownSeconds: 90, maxPerDay: 40 },
  { placement: "post_run_reward", cooldownSeconds: 120, maxPerDay: 20 },
];

const DEFAULT_GUARDRAILS = {
  maxCreativeKb: 256,
  maxLoadMs: 2500,
};

const DEFAULT_SLOTS = {
  menu_banner: { width: 728, height: 90 },
  pause_screen_banner: { width: 480, height: 90 },
  post_run_reward: { width: 320, height: 250 },
};

const MULTIPLAYER_GAMES = new Set(["pong", "chess", "tictactoe"]);

function dayKey(date = new Date()) {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

function readState() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return { placements: {} };
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== "object") return { placements: {} };
    return parsed;
  } catch {
    return { placements: {} };
  }
}

function writeState(state) {
  try { localStorage.setItem(STORAGE_KEY, JSON.stringify(state)); } catch {}
}

function getPlacementState(state, placement) {
  const current = state.placements?.[placement] || {};
  const key = dayKey();
  const count = current.dayKey === key ? Number(current.count || 0) : 0;
  return {
    lastShownAt: Number(current.lastShownAt || 0),
    dayKey: key,
    count,
  };
}

function updatePlacementState(state, placement) {
  const next = { ...state, placements: { ...(state.placements || {}) } };
  const current = getPlacementState(state, placement);
  next.placements[placement] = {
    lastShownAt: Date.now(),
    dayKey: current.dayKey,
    count: current.count + 1,
  };
  return next;
}

function emitEvent(name, detail = {}) {
  try {
    window.dispatchEvent(new CustomEvent(name, { detail }));
  } catch {}
}

function normalizeRules(list) {
  const map = new Map();
  for (const rule of list) {
    if (!rule?.placement) continue;
    map.set(rule.placement, {
      placement: rule.placement,
      cooldownSeconds: Number(rule.cooldownSeconds || 0),
      maxPerDay: Number(rule.maxPerDay || 0),
    });
  }
  for (const rule of DEFAULT_RULES) {
    if (!map.has(rule.placement)) map.set(rule.placement, rule);
  }
  return Array.from(map.values());
}

function createAdFrame({ placement, provider, creativeId, variantId, slot }) {
  const frame = document.createElement("iframe");
  frame.className = "arc-ad-frame";
  frame.setAttribute("title", "Sponsored");
  frame.setAttribute("sandbox", "allow-scripts allow-forms allow-popups");
  frame.setAttribute("referrerpolicy", "no-referrer");
  frame.setAttribute("loading", "lazy");
  frame.width = String(slot?.width || 320);
  frame.height = String(slot?.height || 250);

  const params = new URLSearchParams({
    placement,
    provider,
    creativeId,
    variantId,
  });
  frame.src = `/arcade/ads/house.html?${params.toString()}`;

  return frame;
}

export function initAdManager({ apiBase = "", multiplayerGameIds = MULTIPLAYER_GAMES } = {}) {
  if (window.__poAdManager) return window.__poAdManager;

  let rules = DEFAULT_RULES;
  let guardrails = DEFAULT_GUARDRAILS;
  let allowlist = ["house"];
  let blockedCreatives = [];
  let rulesLoaded = false;
  let gameState = "idle"; // idle | active | paused | ended
  let multiplayer = false;

  const loadConfig = async () => {
    if (rulesLoaded) return { rules, guardrails, allowlist, blockedCreatives };
    try {
      const res = await fetch(`${apiBase}${CONFIG_ENDPOINT}`, { cache: "no-store" });
      if (res.ok) {
        const payload = await res.json();
        rules = normalizeRules(Array.isArray(payload?.placements) ? payload.placements : []);
        guardrails = payload?.guardrails || DEFAULT_GUARDRAILS;
        allowlist = Array.isArray(payload?.allowlist) ? payload.allowlist : allowlist;
        blockedCreatives = Array.isArray(payload?.blockedCreatives) ? payload.blockedCreatives : [];
      }
    } catch {
      rules = normalizeRules(DEFAULT_RULES);
    }
    rulesLoaded = true;
    return { rules, guardrails, allowlist, blockedCreatives };
  };

  const getRule = (placement) => {
    const match = rules.find((r) => r.placement === placement);
    return match || DEFAULT_RULES.find((r) => r.placement === placement) || DEFAULT_RULES[0];
  };

  const isBlockedCreative = (provider, creativeId) =>
    blockedCreatives.some((item) => item.provider === provider && item.creative_id === creativeId);

  const canShow = (placement) => {
    if (gameState === "active") return { ok: false, reason: "game_active" };
    if (multiplayer) return { ok: false, reason: "multiplayer" };
    if (placement === "pause_screen_banner" && gameState !== "paused") {
      return { ok: false, reason: "not_paused" };
    }
    if (placement === "post_run_reward" && gameState !== "ended") {
      return { ok: false, reason: "not_ended" };
    }

    const rule = getRule(placement);
    const state = readState();
    const current = getPlacementState(state, placement);
    const cooldownMs = rule.cooldownSeconds * 1000;

    if (cooldownMs && Date.now() - current.lastShownAt < cooldownMs) {
      return { ok: false, reason: "cooldown" };
    }

    if (rule.maxPerDay && current.count >= rule.maxPerDay) {
      return { ok: false, reason: "daily_cap" };
    }

    return { ok: true };
  };

  const recordImpression = (placement, meta) => {
    const state = readState();
    const next = updatePlacementState(state, placement);
    writeState(next);
    emitEvent("arcade:ad:impression", { placement, ...meta });
  };

  const renderAd = async ({ container, placement, provider = "house", creativeId = "house-default", variantId = "control", creativeMeta } = {}) => {
    if (!container) return false;
    await loadConfig();

    if (!allowlist.includes(provider)) {
      emitEvent("arcade:ad:blocked", { placement, reason: "provider_not_allowlisted", provider, creativeId });
      return false;
    }

    if (isBlockedCreative(provider, creativeId)) {
      emitEvent("arcade:ad:blocked", { placement, reason: "creative_blocked", provider, creativeId });
      return false;
    }

    const meta = creativeMeta || { sizeKb: 40, loadMs: 800 };
    if (meta.sizeKb > guardrails.maxCreativeKb || meta.loadMs > guardrails.maxLoadMs) {
      emitEvent("arcade:ad:blocked", { placement, reason: "creative_guardrail", provider, creativeId, creativeMeta: meta });
      return false;
    }

    const verdict = canShow(placement);
    if (!verdict.ok) {
      emitEvent("arcade:ad:blocked", { placement, reason: verdict.reason, provider, creativeId });
      return false;
    }

    const slot = DEFAULT_SLOTS[placement] || DEFAULT_SLOTS.menu_banner;
    const frame = createAdFrame({ placement, provider, creativeId, variantId, slot });

    container.innerHTML = "";
    container.classList.add("arc-ad-slot");
    container.style.setProperty("--ad-slot-width", `${slot.width}px`);
    container.style.setProperty("--ad-slot-height", `${slot.height}px`);
    container.appendChild(frame);

    recordImpression(placement, { provider, creativeId, variantId, creativeMeta: meta });
    return true;
  };

  const showRewarded = async ({ placement = "post_run_reward", onReward, provider, creativeId, variantId } = {}) => {
    const slot = DEFAULT_SLOTS.post_run_reward;
    const modalSlot = document.querySelector("[data-ad-slot][data-ad-placement='post_run_reward']");
    if (!modalSlot) return { ok: false };

    const ok = await renderAd({
      container: modalSlot,
      placement,
      provider,
      creativeId,
      variantId,
    });

    if (!ok) return { ok: false };

    setTimeout(() => {
      emitEvent("arcade:ad:reward", { placement, provider: provider || "house", creativeId: creativeId || "house-default" });
      onReward?.();
    }, 1500);

    return { ok: true };
  };

  const mountBanner = async ({ container, placement = "menu_banner", provider, creativeId, variantId } = {}) => {
    return renderAd({ container, placement, provider, creativeId, variantId });
  };

  const setGameState = ({ active, mode, gameId } = {}) => {
    if (typeof active === "boolean") gameState = active ? "active" : "idle";
    if (mode) gameState = mode;
    if (gameId) multiplayer = multiplayerGameIds.has(gameId);
  };

  const bindGameEvents = () => {
    const events = ["arcade:game:start", "arcade:game:restart", "arcade:game:pause", "arcade:game:resume", "arcade:game:over"];
    for (const name of events) {
      window.addEventListener(name, (e) => {
        const detail = e?.detail || {};
        if (name === "arcade:game:start" || name === "arcade:game:restart") {
          setGameState({ active: true, mode: "active", gameId: detail.gameId });
        }
        if (name === "arcade:game:pause") {
          setGameState({ active: false, mode: "paused", gameId: detail.gameId });
          const slot = document.querySelector("[data-ad-slot][data-ad-placement='pause_screen_banner']");
          if (slot) mountBanner({ container: slot, placement: "pause_screen_banner" });
        }
        if (name === "arcade:game:resume") {
          setGameState({ active: true, mode: "active", gameId: detail.gameId });
        }
        if (name === "arcade:game:over") {
          setGameState({ active: false, mode: "ended", gameId: detail.gameId });
          showRewarded({ placement: "post_run_reward" });
        }
      });
    }
  };

  const bindMessageEvents = () => {
    window.addEventListener("message", (event) => {
      const data = event?.data || {};
      if (data.type !== "arcade_ad_click") return;
      emitEvent("arcade:ad:click", {
        placement: data.placement,
        provider: data.provider,
        creativeId: data.creativeId,
        variantId: data.variantId,
      });
    });
  };

  bindMessageEvents();

  const api = {
    loadConfig,
    canShow,
    mountBanner,
    showRewarded,
    setGameState,
    bindGameEvents,
  };

  window.__poAdManager = api;
  return api;
}
