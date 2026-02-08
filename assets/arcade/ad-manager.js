const STORAGE_KEY = "po_arcade_ad_state_v1";
const RULES_ENDPOINT = "/api/arcade/ad-rules";

const DEFAULT_RULES = [
  { placement: "interstitial", cooldownSeconds: 120, maxPerDay: 10 },
  { placement: "rewarded", cooldownSeconds: 60, maxPerDay: 20 },
  { placement: "banner", cooldownSeconds: 0, maxPerDay: 1000 },
];

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

function emitEvent(name, detail = {}) {
  try {
    window.dispatchEvent(new CustomEvent(name, { detail }));
  } catch {}
}

function buildBannerAd({ placement }) {
  const wrap = document.createElement("div");
  wrap.className = "po-ad po-ad--banner";
  wrap.setAttribute("role", "region");
  wrap.setAttribute("aria-label", "Sponsored");

  const label = document.createElement("div");
  label.className = "po-ad__label";
  label.textContent = "Sponsored";

  const body = document.createElement("div");
  body.className = "po-ad__body";
  body.textContent = "Arcade gear, desk setups, and study tools.";

  const cta = document.createElement("button");
  cta.className = "po-ad__cta";
  cta.type = "button";
  cta.textContent = "Learn more";
  cta.addEventListener("click", () => {
    emitEvent("arcade:ad:click", { placement });
  });

  wrap.append(label, body, cta);
  return wrap;
}

function buildInterstitialAd({ placement }) {
  const overlay = document.createElement("div");
  overlay.className = "po-ad-overlay";
  overlay.setAttribute("role", "dialog");
  overlay.setAttribute("aria-modal", "true");

  const card = document.createElement("div");
  card.className = "po-ad po-ad--interstitial";

  const label = document.createElement("div");
  label.className = "po-ad__label";
  label.textContent = "Sponsored";

  const title = document.createElement("div");
  title.className = "po-ad__title";
  title.textContent = "Unlock more brain-boosting challenges.";

  const body = document.createElement("div");
  body.className = "po-ad__body";
  body.textContent = "Try the Odyssey weekly challenge pack.";

  const actions = document.createElement("div");
  actions.className = "po-ad__actions";

  const skip = document.createElement("button");
  skip.className = "po-ad__cta po-ad__cta--ghost";
  skip.type = "button";
  skip.textContent = "Skip";

  const cta = document.createElement("button");
  cta.className = "po-ad__cta";
  cta.type = "button";
  cta.textContent = "Check it out";
  cta.addEventListener("click", () => {
    emitEvent("arcade:ad:click", { placement });
  });

  actions.append(skip, cta);
  card.append(label, title, body, actions);
  overlay.append(card);

  return { overlay, skip };
}

export function initAdManager({ apiBase = "", multiplayerGameIds = MULTIPLAYER_GAMES } = {}) {
  if (window.__poAdManager) return window.__poAdManager;

  let rules = DEFAULT_RULES;
  let rulesLoaded = false;
  let gameActive = false;
  let multiplayer = false;

  const loadRules = async () => {
    if (rulesLoaded) return rules;
    try {
      const res = await fetch(`${apiBase}${RULES_ENDPOINT}`, { cache: "no-store" });
      if (res.ok) {
        const payload = await res.json();
        rules = normalizeRules(Array.isArray(payload?.rules) ? payload.rules : []);
      }
    } catch {
      rules = normalizeRules(DEFAULT_RULES);
    }
    rulesLoaded = true;
    return rules;
  };

  const getRule = (placement) => {
    const match = rules.find((r) => r.placement === placement);
    return match || DEFAULT_RULES.find((r) => r.placement === placement) || DEFAULT_RULES[0];
  };

  const canShow = (placement) => {
    if (gameActive) return { ok: false, reason: "game_active" };
    if (multiplayer) return { ok: false, reason: "multiplayer" };

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

  const recordImpression = (placement) => {
    const state = readState();
    const next = updatePlacementState(state, placement);
    writeState(next);
    emitEvent("arcade:ad:impression", { placement });
  };

  const showInterstitial = async ({ placement = "interstitial" } = {}) => {
    await loadRules();
    const verdict = canShow(placement);
    if (!verdict.ok) {
      emitEvent("arcade:ad:blocked", { placement, reason: verdict.reason });
      return false;
    }

    const { overlay, skip } = buildInterstitialAd({ placement });

    return new Promise((resolve) => {
      const close = () => {
        overlay.remove();
        resolve(true);
      };

      skip.addEventListener("click", close, { once: true });
      overlay.addEventListener("click", (event) => {
        if (event.target === overlay) close();
      });

      document.body.appendChild(overlay);
      recordImpression(placement);
    });
  };

  const showRewarded = async ({ placement = "rewarded", onReward } = {}) => {
    await loadRules();
    const verdict = canShow(placement);
    if (!verdict.ok) {
      emitEvent("arcade:ad:blocked", { placement, reason: verdict.reason });
      return { ok: false };
    }

    const { overlay, skip } = buildInterstitialAd({ placement });
    const label = overlay.querySelector(".po-ad__label");
    if (label) label.textContent = "Rewarded";

    return new Promise((resolve) => {
      const grant = () => {
        overlay.remove();
        onReward?.();
        resolve({ ok: true });
      };
      skip.textContent = "No thanks";
      skip.addEventListener("click", () => {
        overlay.remove();
        resolve({ ok: false });
      }, { once: true });

      document.body.appendChild(overlay);
      recordImpression(placement);
      setTimeout(grant, 1500);
    });
  };

  const mountBanner = async ({ container, placement = "banner" } = {}) => {
    if (!container) return false;
    await loadRules();
    const verdict = canShow(placement);
    if (!verdict.ok) {
      emitEvent("arcade:ad:blocked", { placement, reason: verdict.reason });
      return false;
    }

    container.innerHTML = "";
    container.appendChild(buildBannerAd({ placement }));
    recordImpression(placement);
    return true;
  };

  const setGameState = ({ active, gameId } = {}) => {
    if (typeof active === "boolean") gameActive = active;
    if (gameId) multiplayer = multiplayerGameIds.has(gameId);
  };

  const handleGameEvent = (eventName, detail = {}) => {
    if (eventName === "arcade:game:start" || eventName === "arcade:game:restart") {
      setGameState({ active: true, gameId: detail.gameId });
    }
    if (eventName === "arcade:game:over") {
      setGameState({ active: false, gameId: detail.gameId });
    }
  };

  const bindGameEvents = () => {
    const events = ["arcade:game:start", "arcade:game:restart", "arcade:game:over"];
    for (const name of events) {
      window.addEventListener(name, (e) => {
        handleGameEvent(name, e?.detail || {});
        if (name === "arcade:game:over") {
          showInterstitial({ placement: "interstitial" });
        }
      });
    }
  };

  const api = {
    loadRules,
    canShow,
    showInterstitial,
    showRewarded,
    mountBanner,
    setGameState,
    bindGameEvents,
  };

  window.__poAdManager = api;
  return api;
}
