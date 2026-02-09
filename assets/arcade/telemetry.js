const API_BASE = "/api/arcade";
const PLAYER_KEY = "po_arcade_player_id";
const SESSION_KEY = "po_arcade_session_v1";
const ANON_KEY = "po_arcade_anon_id";

function getAnonId() {
  try {
    const existing = localStorage.getItem(ANON_KEY);
    if (existing) return existing;
    const created = crypto?.randomUUID?.() || `anon_${Date.now()}_${Math.random().toString(16).slice(2)}`;
    localStorage.setItem(ANON_KEY, created);
    return created;
  } catch {
    return `anon_${Date.now()}_${Math.random().toString(16).slice(2)}`;
  }
}

function getStoredSession() {
  try {
    const raw = localStorage.getItem(SESSION_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

function storeSession(value) {
  try {
    if (!value) {
      localStorage.removeItem(SESSION_KEY);
      return;
    }
    localStorage.setItem(SESSION_KEY, JSON.stringify(value));
  } catch {}
}

async function apiPost(path, payload, options = {}) {
  const res = await fetch(`${API_BASE}${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload || {}),
    ...options,
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(text || res.statusText || "request_failed");
  }
  return res.json();
}

async function ensurePlayerId() {
  try {
    const existing = localStorage.getItem(PLAYER_KEY);
    if (existing) return existing;
    const payload = await apiPost("/player", {});
    const id = payload?.player?.id;
    if (id) localStorage.setItem(PLAYER_KEY, id);
    return id;
  } catch {
    return null;
  }
}

function buildFingerprint() {
  const parts = [
    navigator.userAgent || "",
    navigator.language || "",
    `${screen?.width || 0}x${screen?.height || 0}`,
    Intl.DateTimeFormat().resolvedOptions().timeZone || "",
  ];
  return parts.join("|");
}

function buildEvent({ eventType, sessionId, userId, anonId, source, payload }) {
  const eventId = crypto?.randomUUID?.() || `evt_${Date.now()}_${Math.random().toString(16).slice(2)}`;
  return {
    eventId,
    eventType,
    occurredAt: new Date().toISOString(),
    sessionId: sessionId || null,
    userId: userId || null,
    anonId: anonId || null,
    source: source || "arcade",
    dedupeKey: eventId,
    payload: payload || {},
  };
}

async function sendGameplayEvent(event) {
  try {
    await apiPost("/events/gameplay", event, { keepalive: true });
  } catch {}
}

async function sendAdEvent(event) {
  try {
    await apiPost("/events/ad", event, { keepalive: true });
  } catch {}
}

export function initArcadeTelemetry() {
  const anonId = getAnonId();

  const startSession = async ({ gameId, gameTitle, source }) => {
    const playerId = await ensurePlayerId();
    if (!playerId) return null;

    const payload = await apiPost("/session/start", {
      playerId,
      gameId,
      gameTitle,
      source,
      clientFingerprint: buildFingerprint(),
    });

    const session = payload?.session;
    if (!session?.id || !session?.token) return null;

    const stored = {
      sessionId: session.id,
      sessionToken: session.token,
      playerId,
      gameId,
      startedAt: session.startedAt,
      expiresAt: session.expiresAt,
    };
    storeSession(stored);

    await sendGameplayEvent(buildEvent({
      eventType: "game_session_start",
      sessionId: session.id,
      userId: playerId,
      anonId,
      source,
      payload: { gameId, gameTitle },
    }));

    return stored;
  };

  const endSession = async ({ reason, source } = {}) => {
    const active = getStoredSession();
    if (!active?.sessionId) return;

    try {
      await apiPost("/session/end", {
        sessionId: active.sessionId,
        reason,
      }, { keepalive: true });
    } catch {}

    await sendGameplayEvent(buildEvent({
      eventType: "game_session_end",
      sessionId: active.sessionId,
      userId: active.playerId,
      anonId,
      source,
      payload: { reason },
    }));

    storeSession(null);
  };

  const submitScore = async ({ score, gameId, gameTitle, telemetry, source } = {}) => {
    const active = getStoredSession();
    if (!active?.sessionId || !active?.sessionToken) return null;

    const payload = {
      playerId: active.playerId,
      gameId: gameId || active.gameId,
      gameTitle,
      sessionId: active.sessionId,
      sessionToken: active.sessionToken,
      score,
      telemetry,
    };

    await sendGameplayEvent(buildEvent({
      eventType: "score_submitted",
      sessionId: active.sessionId,
      userId: active.playerId,
      anonId,
      source,
      payload: { score, gameId: payload.gameId },
    }));

    try {
      const res = await apiPost("/score", payload, { keepalive: true });
      await sendGameplayEvent(buildEvent({
        eventType: "score_validated",
        sessionId: active.sessionId,
        userId: active.playerId,
        anonId,
        source,
        payload: { score, gameId: payload.gameId, riskScore: res?.validation?.riskScore },
      }));
      return res;
    } catch (err) {
      return { ok: false, error: "score_submit_failed" };
    }
  };

  const bindAdEvents = () => {
    const handle = (eventName, eventType) => (e) => {
      const detail = e?.detail || {};
      const active = getStoredSession();
      const event = buildEvent({
        eventType,
        sessionId: active?.sessionId,
        userId: active?.playerId,
        anonId,
        source: detail.source || "arcade",
        payload: detail,
      });

      if (eventType.startsWith("ad_")) {
        event.placement = detail.placement || null;
        event.provider = detail.provider || "house";
        event.creativeId = detail.creativeId || "house-default";
        event.variantId = detail.variantId || "control";
        sendAdEvent(event);
      } else {
        sendGameplayEvent(event);
      }
    };

    window.addEventListener("arcade:ad:impression", handle("arcade:ad:impression", "ad_impression"));
    window.addEventListener("arcade:ad:click", handle("arcade:ad:click", "ad_click"));
    window.addEventListener("arcade:ad:reward", handle("arcade:ad:reward", "reward_completed"));
  };

  return {
    startSession,
    endSession,
    submitScore,
    bindAdEvents,
    getActiveSession: getStoredSession,
  };
}
