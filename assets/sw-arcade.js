/**
 * sw-arcade.js
 * Arcade-focused caching:
 * - HTML (arcade pages): network-first (keeps updates fresh), cache fallback
 * - Assets (css/js/svg): cache-first (instant)
 * - Auto-cache GET requests as they are fetched
 */

const CACHE = "po-arcade-cache-v2";

// Precache the arcade shell (keep tight: only what Arcade needs)
const PRECACHE = [
  "/arcade/",
  "/arcade/index.html",
  "/arcade/play.html",

  "/assets/arcade.css",
  "/assets/arcade.js",

  // if these are used by games (they are in your current file)
  "/assets/lib/storage.js",
  "/assets/lib/rng.js",
  "/assets/lib/ui.js",

  // games (optional to precache; keeps first play instant)
  "/assets/games/quickmath.js",
  "/assets/games/wordle.js",
  "/assets/games/sudoku.js",
  "/assets/games/tictactoe.js",
  "/assets/games/hangman.js",
  "/assets/games/chess.js",
  "/assets/games/pong.js",
  "/assets/games/snake.js",

  "/favicon.svg",
];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches
      .open(CACHE)
      .then((c) => c.addAll(PRECACHE))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.map((k) => (k === CACHE ? null : caches.delete(k)))))
      .then(() => self.clients.claim())
  );
});

function isSameOrigin(url) {
  return url.origin === self.location.origin;
}

function isArcadeHTML(url, req) {
  if (req.method !== "GET") return false;
  if (req.destination && req.destination !== "document") return false;
  return url.pathname === "/arcade/" || url.pathname.startsWith("/arcade/");
}

function isStaticAsset(req) {
  if (req.method !== "GET") return false;
  // cache-first for common static types
  return (
    req.destination === "script" ||
    req.destination === "style" ||
    req.destination === "image" ||
    req.destination === "font"
  );
}

async function networkFirst(req) {
  const cache = await caches.open(CACHE);
  try {
    const fresh = await fetch(req);
    if (fresh && fresh.ok) cache.put(req, fresh.clone());
    return fresh;
  } catch (_) {
    const cached = await cache.match(req);
    if (cached) return cached;
    throw _;
  }
}

async function cacheFirst(req) {
  const cache = await caches.open(CACHE);
  const cached = await cache.match(req);
  if (cached) return cached;

  const res = await fetch(req);
  if (res && res.ok) cache.put(req, res.clone());
  return res;
}

self.addEventListener("fetch", (event) => {
  const req = event.request;
  const url = new URL(req.url);

  // Only handle same-origin
  if (!isSameOrigin(url)) return;

  // Arcade navigation pages: keep fresh (network-first)
  if (isArcadeHTML(url, req)) {
    event.respondWith(networkFirst(req));
    return;
  }

  // Static assets: instant (cache-first)
  if (isStaticAsset(req)) {
    event.respondWith(cacheFirst(req));
    return;
  }

  // Default: try cache, then network, and store successful GETs
  event.respondWith(
    (async () => {
      const cache = await caches.open(CACHE);
      const cached = await cache.match(req);
      if (cached) return cached;

      const res = await fetch(req);
      if (req.method === "GET" && res && res.ok) cache.put(req, res.clone());
      return res;
    })()
  );
});