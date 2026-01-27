// Stable daily seed + per-run seed. Keeps content fresh, still deterministic.
export function dailySeed(prefix = "po") {
  const d = new Date();
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  return `${prefix}-${yyyy}-${mm}-${dd}`;
}

export function newRunSeed(baseSeed, rng, extra = "") {
  // Create a run id that changes per restart but stays deterministic for debugging if you store it.
  const n = Math.floor(rng.next() * 1e9).toString(36);
  return `${baseSeed}:${n}:${extra}`;
}