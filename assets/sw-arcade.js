/**
 * sw-arcade.js
 * Minimal cache-first for arcade assets.
 * Keep scope limited: only caches arcade + assets used by arcade.
 */

const CACHE = 'po-arcade-cache-v1';
const ASSETS = [
  '/arcade/',
  '/arcade/index.html',
  '/assets/arcade.css',
  '/assets/arcade.js',
  '/assets/lib/storage.js',
  '/assets/lib/rng.js',
  '/assets/lib/ui.js',
  '/assets/games/quickmath.js',
  '/assets/games/wordle.js',
  '/assets/games/sudoku.js',
  '/assets/games/tictactoe.js',
  '/assets/games/hangman.js',
  '/assets/games/chess.js',
  '/favicon.svg',
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE).then((c) => c.addAll(ASSETS)).then(() => self.skipWaiting()),
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.map((k) => (k === CACHE ? null : caches.delete(k)))),
    ).then(() => self.clients.claim()),
  );
});

self.addEventListener('fetch', (event) => {
  const req = event.request;
  const url = new URL(req.url);

  // Only handle same-origin
  if (url.origin !== location.origin) {
    return;
  }

  event.respondWith(
    caches.match(req).then((cached) => {
      if (cached) {
        return cached;
      }
      return fetch(req).then((res) => {
        // Cache successful GETs (avoid caching POST or opaque)
        if (req.method === 'GET' && res.ok) {
          const copy = res.clone();
          caches.open(CACHE).then((c) => c.put(req, copy));
        }
        return res;
      });
    }),
  );
});
