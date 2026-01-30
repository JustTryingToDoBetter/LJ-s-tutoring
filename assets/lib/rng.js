/**
 * rng.js
 * Deterministic RNG helpers (seeded) for repeatable runs.
 */

// Mulberry32 RNG from 32-bit seed
export function seededRng(seed) {
  let t = seed >>> 0;
  return function rand() {
    t += 0x6D2B79F5;
    let x = Math.imul(t ^ (t >>> 15), 1 | t);
    x ^= x + Math.imul(x ^ (x >>> 7), 61 | x);
    return ((x ^ (x >>> 14)) >>> 0) / 4294967296;
  };
}

export function dayKey(date = new Date()) {
  // Local midnight-based key: YYYY-MM-DD
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

export function hashStringToSeed(str) {
  // Simple stable hash to 32-bit int (FNV-1a style)
  let h = 2166136261;
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

/**
 * createRNG(seedStr)
 * - Replaces assets/arcade/rng.js
 * - Adds helpers: int/pick/shuffle
 */
export function createRNG(seedStr = "po-default") {
  const seed = hashStringToSeed(String(seedStr));
  const next = seededRng(seed);

  const int = (min, max) => {
    const a = Math.floor(min);
    const b = Math.floor(max);
    return Math.floor(next() * (b - a + 1)) + a;
  };

  const pick = (arr) => arr[int(0, arr.length - 1)];

  const shuffle = (arr) => {
    const a2 = arr.slice();
    for (let i = a2.length - 1; i > 0; i--) {
      const j = int(0, i);
      [a2[i], a2[j]] = [a2[j], a2[i]];
    }
    return a2;
  };

  return { next, int, pick, shuffle, seed: String(seedStr) };
}