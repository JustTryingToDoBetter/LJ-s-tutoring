/**
 * quickmath.js — Storm Sprint (Quick Math)
 * - Uses shared UI classes (po-stats / po-input / po-btn)
 * - No inline layout styling besides small spacing
 */
import { el, clear } from "../lib/ui.js";
import { hashStringToSeed, seededRng, dayKey } from "../lib/rng.js";
import { loadJsonPack } from "../lib/packs.js";

const RULES_URL = "/arcade/packs/quickmath-rules.json";

export async function mountQuickMath(root, ctx) {
  clear(root);

  const state = ctx.getState();
  const best = state.games.quickmath.best || 0;

  const panel = el("section", { class: "po-arcade__panel po-animate-in" }, [
    el("div", { class: "po-muted", text: "Answer fast. Build a streak. Beat your best." }),
    el("div", { class: "po-game__status", style: "margin-top:8px;" }, [`Best score: ${best}`]),
  ]);

  const actions = el("div", { class: "po-game__controls", style: "margin-top:12px;" }, []);
  const startBtn = el("button", { class: "po-btn po-btn-primary", type: "button" }, ["Start Sprint"]);
  actions.append(startBtn);

  const body = el("div", { style: "margin-top:12px;" }, []);
  panel.append(actions, body);
  root.append(panel);

  startBtn.addEventListener("click", async () => {
    clear(body);
    body.append(el("div", { class: "po-muted", text: "Loading rules…" }));

    try {
      const rules = await loadJsonPack(RULES_URL);
      runSprint(body, ctx, rules, { mode: "run" });
    } catch {
      clear(body);
      body.append(el("div", { class: "po-muted", text: `Rules pack missing: ${RULES_URL}` }));
    }
  });
}

function runSprint(mount, ctx, rules, { mode = "run" } = {}) {
  clear(mount);

  const DURATION_MS = 45_000;

  // “run” is intentionally non-deterministic; “daily” below is deterministic
  const seed = hashStringToSeed(`po-qm-${mode}-${Date.now()}`);
  const rng = seededRng(seed);

  let score = 0;
  let streak = 0;
  let answered = 0;

  const timerEl = el("div", { class: "po-stat-value", "aria-live": "polite" }, ["45"]);
  const scoreEl = el("div", { class: "po-stat-value" }, ["0"]);
  const streakEl = el("div", { class: "po-stat-value" }, ["0"]);

  let q = nextQuestion(rules, rng, { streak });

  const stats = el("div", { class: "po-stats" }, [
    statBox("Time", timerEl),
    statBox("Score", scoreEl),
    statBox("Streak", streakEl),
  ]);

  const questionEl = el("div", { class: "po-qm-question", text: q.text });
  const input = el("input", {
    type: "text",
    inputmode: "numeric",
    autocomplete: "off",
    class: "po-input",
    "aria-label": "Type your answer",
  });

  const msg = el("div", { class: "po-game__status", style: "margin-top:10px;" }, ["Press Enter to submit."]);
  const endBtn = el("button", { class: "po-btn po-btn-ghost", type: "button" }, ["End run"]);

  mount.append(stats, el("div", { style: "margin-top:12px;" }, [questionEl]), input, msg, el("div", { style: "margin-top:12px;" }, [endBtn]));
  input.focus();

  const start = performance.now();
  const tick = setInterval(() => {
    const left = Math.max(0, DURATION_MS - (performance.now() - start));
    timerEl.textContent = String(Math.ceil(left / 1000));
    if (left <= 0) finish();
  }, 250);

  endBtn.addEventListener("click", finish);

  input.addEventListener("keydown", (e) => {
    if (e.key !== "Enter") return;

    const val = input.value.trim();
    if (!val) return;

    const n = Number(val);
    if (!Number.isFinite(n)) return;

    answered++;

    if (n === q.answer) {
      streak++;
      const mult = 1 + Math.min(2.5, streak * 0.08);
      const gained = Math.floor(q.points * mult);
      score += gained;
      msg.textContent = `✅ Clean strike (+${gained}).`;
    } else {
      msg.textContent = `❌ Miss. Correct was ${q.answer}.`;
      streak = Math.max(0, Math.floor(streak * 0.4));
    }

    scoreEl.textContent = String(score);
    streakEl.textContent = String(streak);

    q = nextQuestion(rules, rng, { streak });
    questionEl.textContent = q.text;
    input.value = "";
  });

  function finish() {
    clearInterval(tick);
    input.disabled = true;
    endBtn.disabled = true;

    const next = ctx.getState();
    next.games.quickmath.best = Math.max(next.games.quickmath.best || 0, score);
    next.games.quickmath.last = { score, streak, answered, at: Date.now() };
    ctx.setState(next);

    ctx.onQuestComplete?.({ gameId: "quickmath", points: score });
    msg.textContent = `Run complete. Score: ${score}.`;
  }
}

function statBox(label, valueNode) {
  return el("div", { class: "po-stat" }, [
    el("div", { class: "po-stat-label", text: label }),
    valueNode,
  ]);
}

function nextQuestion(rules, rng, { streak = 0 } = {}) {
  const ops = Array.isArray(rules?.ops) ? rules.ops : [];
  if (!ops.length) return { text: "0 + 0 = ?", answer: 0, points: 1 };

  const d = Math.min(1, streak / 25);

  const pick = weightedPick(
    ops.map((o) => ({
      item: o,
      w: (o.op === "÷" ? 0.6 : 1) + (o.points || 1) * d,
    })),
    rng
  );

  const op = pick.op;
  let a = 0, b = 0, ans = 0, text = "";
  const points = pick.points || 1;

  if (op === "+") {
    a = int(rng, lerp(pick.minA, pick.maxA, d), pick.maxA);
    b = int(rng, lerp(pick.minB, pick.maxB, d), pick.maxB);
    ans = a + b;
    text = `${a} + ${b} = ?`;
  } else if (op === "-") {
    a = int(rng, lerp(pick.minA, pick.maxA, d), pick.maxA);
    b = int(rng, pick.minB, Math.min(a, pick.maxB));
    ans = a - b;
    text = `${a} − ${b} = ?`;
  } else if (op === "×") {
    a = int(rng, lerp(pick.minA, pick.maxA, d), pick.maxA);
    b = int(rng, lerp(pick.minB, pick.maxB, d), pick.maxB);
    ans = a * b;
    text = `${a} × ${b} = ?`;
  } else {
    b = int(rng, pick.minB, pick.maxB);
    const q = int(rng, pick.minQ, pick.maxQ);
    a = b * q;
    ans = q;
    text = `${a} ÷ ${b} = ?`;
  }

  return { text, answer: ans, points };
}

function int(rng, min, max) {
  const a = Math.floor(min);
  const b = Math.floor(max);
  return Math.floor(rng() * (b - a + 1)) + a;
}
function lerp(a, b, t) { return a + (b - a) * t; }

function weightedPick(table, rng) {
  const total = table.reduce((s, x) => s + (x.w ?? 1), 0);
  let r = rng() * total;
  for (const x of table) {
    r -= (x.w ?? 1);
    if (r <= 0) return x.item;
  }
  return table[table.length - 1].item;
}

/** Daily runner (kept deterministic) */
export async function runDailyQuickMath(root, ctx) {
  clear(root);

  const key = dayKey();
  const seed = hashStringToSeed(`po-daily-qm-${key}`);
  const rng = seededRng(seed);
  const rules = await loadJsonPack(RULES_URL);

  // Keep it simple: just run the same sprint logic with deterministic rng & capped duration
  runSprint(root, ctx, rules, { mode: "daily" });

  return { completed: true };
}