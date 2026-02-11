/**
 * sw-arcade.js
 * Arcade-focused caching:
 * - HTML (arcade pages): network-first (keeps updates fresh), cache fallback
 * - Assets (css/js/svg): cache-first (instant)
 * - Auto-cache GET requests as they are fetched
 */

// Build script replaces CACHE in dist/assets/sw-arcade.js
const CACHE = 'po-arcade-dev';

// Precache the arcade shell (keep tight: only what Arcade needs)
const PRECACHE = [
  '/arcade/',
  '/arcade/index.html',
  '/arcade/play.html',

  '/assets/arcade.css',
  '/assets/arcade.js',
  '/assets/po-game-ui.css',
  '/assets/tailwind-input.css',

  '/assets/arcade/frame.js',
  '/assets/arcade/sdk-core.js',
  '/assets/arcade/console-runtime.js',
  '/assets/arcade/telemetry.js',
  '/assets/arcade/ad-manager.js',
  '/assets/arcade/ui/arcade-ui.css',
  '/assets/arcade/ui/Button.js',
  '/assets/arcade/ui/ConsolePage.js',
  '/assets/arcade/ui/HUD.js',
  '/assets/arcade/ui/HowTo.js',
  '/assets/arcade/ui/Modal.js',
  '/assets/arcade/ui/SettingsPanel.js',
  '/assets/arcade/ui/Toast.js',
  '/assets/arcade/ui/dom.js',

  // if these are used by games (they are in your current file)
  '/assets/lib/storage.js',
  '/assets/lib/rng.js',
  '/assets/lib/ui.js',

  // games (optional to precache; keeps first play instant)
  '/assets/games/chess.js',
  '/assets/games/2048.js',
  '/assets/games/asteroids.js',
  '/assets/games/invaders.js',
  '/assets/games/minesweeper.js',
  '/assets/games/hangman.js',
  '/assets/games/pong.js',
  '/assets/games/quickmath.js',
  '/assets/games/snake.js',
  '/assets/games/sudoku.js',
  '/assets/games/tictactoe.js',
  '/assets/games/wordle.js',

  '/arcade/games/chess/',
  '/arcade/games/chess/index.html',
  '/arcade/games/chess/game.js',
  '/arcade/games/2048/',
  '/arcade/games/2048/index.html',
  '/arcade/games/2048/game.js',
  '/arcade/games/asteroids/',
  '/arcade/games/asteroids/index.html',
  '/arcade/games/asteroids/game.js',
  '/arcade/games/invaders/',
  '/arcade/games/invaders/index.html',
  '/arcade/games/invaders/game.js',
  '/arcade/games/minesweeper/',
  '/arcade/games/minesweeper/index.html',
  '/arcade/games/minesweeper/game.js',
  '/arcade/games/hangman/',
  '/arcade/games/hangman/index.html',
  '/arcade/games/hangman/game.js',
  '/arcade/games/pong/',
  '/arcade/games/pong/index.html',
  '/arcade/games/pong/game.js',
  '/arcade/games/quickmath/',
  '/arcade/games/quickmath/index.html',
  '/arcade/games/quickmath/game.js',
  '/arcade/games/snake/',
  '/arcade/games/snake/index.html',
  '/arcade/games/snake/game.js',
  '/arcade/games/sudoku/',
  '/arcade/games/sudoku/index.html',
  '/arcade/games/sudoku/game.js',
  '/arcade/games/tictactoe/',
  '/arcade/games/tictactoe/index.html',
  '/arcade/games/tictactoe/game.js',
  '/arcade/games/wordle/',
  '/arcade/games/wordle/index.html',
  '/arcade/games/wordle/game.js',

  '/arcade/packs/hangman-words.json',
  '/arcade/packs/quickmath-rules.json',
  '/arcade/packs/wordle-words.json',
  '/assets/data/words-5.json',

  '/arcade/ads/house.html',
  '/arcade/ads/house.js',
  '/arcade/ads/google.html',
  '/arcade/ads/google.js',

  '/favicon.svg',
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches
      .open(CACHE)
      .then((c) => c.addAll(PRECACHE))
      .then(() => self.skipWaiting()),
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.map((k) => (k === CACHE ? null : caches.delete(k)))))
      .then(() => self.clients.claim()),
  );
});

function isSameOrigin(url) {
  return url.origin === self.location.origin;
}

function isArcadeHTML(url, req) {
  if (req.method !== 'GET') {return false;}
  if (req.destination && req.destination !== 'document') {return false;}
  return url.pathname === '/arcade/' || url.pathname.startsWith('/arcade/');
}

function isStaticAsset(req) {
  if (req.method !== 'GET') {return false;}
  // cache-first for common static types
  return (
    req.destination === 'script' ||
    req.destination === 'style' ||
    req.destination === 'image' ||
    req.destination === 'font'
  );
}

async function networkFirst(req) {
  const cache = await caches.open(CACHE);
  try {
    const fresh = await fetch(req);
    if (fresh && fresh.ok) {cache.put(req, fresh.clone());}
    return fresh;
  } catch (_) {
    const cached = await cache.match(req);
    if (cached) {return cached;}
    throw _;
  }
}

async function cacheFirst(req) {
  const cache = await caches.open(CACHE);
  const cached = await cache.match(req);
  if (cached) {return cached;}

  const res = await fetch(req);
  if (res && res.ok) {cache.put(req, res.clone());}
  return res;
}

self.addEventListener('fetch', (event) => {
  const req = event.request;
  const url = new URL(req.url);

  // Only handle same-origin
  if (!isSameOrigin(url)) {return;}

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
      if (cached) {return cached;}

      const res = await fetch(req);
      if (req.method === 'GET' && res && res.ok) {cache.put(req, res.clone());}
      return res;
    })(),
  );
});