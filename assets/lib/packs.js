/**
 * packs.js
 * Loads JSON packs from your static site, caches them locally for offline use.
 * Works with Service Worker caching, but also stores a localStorage fallback.
 */

const LS_PREFIX = "po_pack_v1:";

export async function loadJsonPack(url, { ttlMs = 7 * 24 * 3600_000 } = {}) {
  const key = LS_PREFIX + url;
  const now = Date.now();

  // Try fresh network first (fast when online; SW may serve cached anyway)
  try {
    const res = await fetch(url, { cache: "no-cache" });
    if (res.ok) {
      const data = await res.json();
      safeSet(key, { at: now, data });
      return data;
    }
  } catch {
    // ignore, fall back to cache
  }

  // localStorage fallback (offline-safe)
  const cached = safeGet(key);
  if (cached?.data && typeof cached.at === "number") {
    // stale-while-offline: if it's old, still return it
    if (now - cached.at > ttlMs) return cached.data;
    return cached.data;
  }

  throw new Error(`Missing pack: ${url}`);
}

function safeGet(k) {
  try { return JSON.parse(localStorage.getItem(k) || "null"); } catch { return null; }
}
function safeSet(k, v) {
  try { localStorage.setItem(k, JSON.stringify(v)); } catch {}
}