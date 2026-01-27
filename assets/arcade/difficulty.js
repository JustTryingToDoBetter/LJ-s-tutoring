// Smooth difficulty curves for pacing (0..1)
export function curve(type = "easeInOut") {
  if (type === "linear") return (t) => clamp01(t);
  if (type === "easeIn") return (t) => { t = clamp01(t); return t * t; };
  if (type === "easeOut") return (t) => { t = clamp01(t); return 1 - (1 - t) * (1 - t); };
  return (t) => { // easeInOut
    t = clamp01(t);
    return t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2;
  };
}

export function difficultyAt({ score = 0, timeMs = 0, mode = "score", maxScore = 100, maxTimeMs = 180000, curveType = "easeInOut" } = {}) {
  const c = curve(curveType);
  const raw = mode === "time" ? timeMs / maxTimeMs : score / maxScore;
  return c(raw);
}

function clamp01(x) { return Math.max(0, Math.min(1, x)); }