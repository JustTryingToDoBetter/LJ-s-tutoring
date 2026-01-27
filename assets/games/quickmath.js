/**
 * quickmath.js — Storm Sprint (upgraded)
 * - Loads rules from JSON pack (no hardcoded ops/ranges in code)
 * - Seeded RNG (daily + run)
 * - Dynamic difficulty: streak increases range + points multiplier
 */
import { el, clear, sectionTitle } from "../lib/ui.js";
import { dayKey, hashStringToSeed, seededRng } from "../lib/rng.js";
import { loadJsonPack } from "../lib/packs.js";

const RULES_URL = "/arcade/packs/quickmath-rules.json";

export async function mountQuickMath(root, ctx) {
  const state = ctx.getState();
  const best = state.games.quickmath.best || 0;

  const wrap = el("div", {}, [
    sectionTitle("Storm Sprint (Quick Math)", "Answer fast. Build a streak. Beat your best."),
    el("div", { class: "mt-3" }, [ el("div", { class: "po-muted" }, [`Best score: ${best}`]) ]),
  ]);

  const panel = el("div", { class: "mt-4" }, []);
  const startBtn = el("button", { class: "po-btn po-btn-primary", type: "button" }, ["Start Sprint"]);
  startBtn.addEventListener("click", async () => {
    clear(panel);
    panel.append(el("div", { class: "po-muted" }, ["Loading rules…"]));
    try {
      const rules = await loadJsonPack(RULES_URL);
      runSprint(panel, ctx, rules, { mode: "run" });
    } catch {
      clear(panel);
      panel.append(el("div", { class: "po-muted" }, [`Rules pack missing: ${RULES_URL}`]));
    }
  });

  wrap.append(startBtn, panel);
  root.append(wrap);
}

function runSprint(panel, ctx, rules, { mode = "run" } = {}) {
  clear(panel);

  const DURATION_MS = 45_000;
  const seed = hashStringToSeed(`po-qm-${mode}-${Date.now()}`);
  const rng = seededRng(seed);

  let score = 0;
  let streak = 0;
  let answered = 0;

  const timerEl = el("div", { class: "po-stat-value", "aria-live": "polite" }, ["45"]);
  const scoreEl = el("div", { class: "po-stat-value" }, ["0"]);
  const streakEl = el("div", { class: "po-stat-value", style: "font-size:14px;" }, ["0"]);

  let q = nextQuestion(rules, rng, { streak });

  const questionEl = el("div", { style: "font-size:28px;font-weight:900;margin-top:10px;" }, [q.text]);
  const input = el("input", {
    type: "text",
    inputmode: "numeric",
    autocomplete: "off",
    class: "mt-3 w-full px-4 py-3 rounded-xl border border-slate-200",
    "aria-label": "Type your answer",
  });

  const msg = el("div", { class: "po-muted", style: "margin-top:10px;" }, ["Press Enter to submit."]);
  const stats = el("div", { class: "po-stats", style: "margin-top:12px;" }, [
    statBox("Time", timerEl),
    statBox("Score", scoreEl),
    statBox("Streak", streakEl),
  ]);

  const done = el("button", { class: "po-btn po-btn-ghost", type: "button", style: "margin-top:12px;" }, ["End run"]);
  done.addEventListener("click", finish);

  panel.append(stats, questionEl, input, msg, done);
  input.focus();

  const start = performance.now();
  const tick = setInterval(() => {
    const left = Math.max(0, DURATION_MS - (performance.now() - start));
    timerEl.textContent = String(Math.ceil(left / 1000));
    if (left <= 0) finish();
  }, 250);

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
    done.disabled = true;

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
    el("div", { class: "po-stat-label" }, [label]),
    valueNode,
  ]);
}

function nextQuestion(rules, rng, { streak = 0 } = {}) {
  const ops = Array.isArray(rules?.ops) ? rules.ops : [];
  if (!ops.length) return { text: "0 + 0 = ?", answer: 0, points: 1 };

  // difficulty scales with streak: widen ranges + bias toward harder ops
  const d = Math.min(1, streak / 25);
  const pick = weightedPick(ops.map(o => ({
    item: o,
    w: (o.op === "÷" ? 0.6 : 1) + (o.points || 1) * d
  })), rng);

  const op = pick.op;
  let a = 0, b = 0, ans = 0, text = "";
  let points = pick.points || 1;

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
    // division with integer answer: a = b*q
    b = int(rng, pick.minB, pick.maxB);
    const q = int(rng, pick.minQ, pick.maxQ);
    a = b * q;
    ans = q;
    text = `${a} ÷ ${b} = ?`;
  }

  return { text, answer: ans, points };
}

function int(rng, min, max) {
  min = Math.floor(min); max = Math.floor(max);
  return Math.floor(rng() * (max - min + 1)) + min;
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

/** Daily runner */
export async function runDailyQuickMath(root, ctx) {
  clear(root);

  const key = dayKey();
  const seed = hashStringToSeed(`po-daily-qm-${key}`);
  const rng = seededRng(seed);

  const rules = await loadJsonPack(RULES_URL);

  const wrap = el("div", {}, [
    sectionTitle("Daily Voyage — Storm Sprint", "Short run. Deterministic. One attempt is enough."),
  ]);

  const panel = el("div", { class: "mt-4" }, []);
  wrap.append(panel);
  root.append(wrap);

  const QUESTIONS = 12;
  let score = 0;
  let streak = 0;
  let i = 0;
  let q = nextQuestion(rules, rng, { streak });

  const questionEl = el("div", { style: "font-size:28px;font-weight:900;margin-top:10px;" }, [q.text]);
  const input = el("input", {
    type: "text",
    inputmode: "numeric",
    autocomplete: "off",
    class: "mt-3 w-full px-4 py-3 rounded-xl border border-slate-200",
    "aria-label": "Type your answer",
  });
  const msg = el("div", { class: "po-muted", style: "margin-top:10px;" }, ["Enter to submit."]);
  const meter = el("div", { class: "po-muted", style: "margin-top:10px;" }, [`Question 1 / ${QUESTIONS}`]);

  panel.append(meter, questionEl, input, msg);
  input.focus();

  return await new Promise((resolve) => {
    input.addEventListener("keydown", (e) => {
      if (e.key !== "Enter") return;
      const val = input.value.trim();
      if (!val) return;

      const n = Number(val);
      if (!Number.isFinite(n)) return;

      if (n === q.answer) {
        streak++;
        score += Math.floor(q.points * (1 + Math.min(2, streak * 0.08)));
      } else {
        streak = Math.max(0, Math.floor(streak * 0.4));
      }

      i++;
      if (i >= QUESTIONS) {
        input.disabled = true;
        const next = ctx.getState();
        next.games.quickmath.best = Math.max(next.games.quickmath.best || 0, score);
        ctx.setState(next);
        resolve({ completed: true, score });
        return;
      }

      q = nextQuestion(rules, rng, { streak });
      questionEl.textContent = q.text;
      input.value = "";
      meter.textContent = `Question ${i + 1} / ${QUESTIONS}`;
    });
  });
}