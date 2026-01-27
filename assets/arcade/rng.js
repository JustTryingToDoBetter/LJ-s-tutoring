// Seeded RNG (fast, deterministic). Good for procedural generation and repeatable runs.
export function createRNG(seedStr = "po-default") {
  let h = 2166136261 >>> 0;
  for (let i = 0; i < seedStr.length; i++) {
    h ^= seedStr.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }

  // Mulberry32 PRNG
  let a = h >>> 0;
  const next = () => {
    a |= 0;
    a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t ^= t + Math.imul(t ^ (t >>> 7), 61 | t);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };

  const int = (min, max) => Math.floor(next() * (max - min + 1)) + min;
  const pick = (arr) => arr[int(0, arr.length - 1)];
  const shuffle = (arr) => {
    const a2 = arr.slice();
    for (let i = a2.length - 1; i > 0; i--) {
      const j = int(0, i);
      [a2[i], a2[j]] = [a2[j], a2[i]];
    }
    return a2;
  };

  return { next, int, pick, shuffle, seed: seedStr };
}