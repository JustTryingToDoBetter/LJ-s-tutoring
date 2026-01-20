/**
 * quickmath.js
 * Odyssey flavor: "Storm Sprint" timed arithmetic.
 * Production notes:
 * - No external deps
 * - Keyboard friendly
 * - Saves best score locally
 */

import { el, clear, sectionTitle } from "../lib/ui.js";
import { dayKey, hashStringToSeed, seededRng } from "../lib/rng.js";

export function mountQuickMath(root, ctx) {
  const state = ctx.getState();
  const best = state.games.quickmath.best || 0;

  const wrap = el("div", {}, [
    sectionTitle("Storm Sprint (Quick Math)", "Answer fast. Build a streak. Beat your best."),
    el("div", { class: "mt-3" }, [
      el("div", { class: "po-muted" }, [`Best score: ${best}`]),
    ]),
  ]);

  const panel = el("div", { class: "mt-4" }, []);
  const startBtn = el("button", { class: "po-btn po-btn-primary", type: "button" }, ["Start Sprint"]);
  startBtn.addEventListener("click", () => runSprint(panel, ctx));

  wrap.append(startBtn, panel);
  root.append(wrap);
}

function runSprint(panel, ctx) {
  clear(panel);

  const DURATION_MS = 45_000; // 45 seconds
  const state = ctx.getState();

  let score = 0;
  let q = nextQuestion(Math.random);

  const timerEl = el("div", { class: "po-stat-value", "aria-live": "polite" }, ["45"]);
  const scoreEl = el("div", { class: "po-stat-value" }, ["0"]);

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
    statBox("Tip", el("div", { class: "po-stat-value", style: "font-size:14px;" }, ["Accuracy > speed"])),
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

    // Validate integer input
    const n = Number(val);
    if (!Number.isFinite(n)) return;

    if (n === q.answer) {
      score += q.points;
      scoreEl.textContent = String(score);
      msg.textContent = "✅ Clean strike. Next!";
    } else {
      msg.textContent = `❌ Miss. Correct was ${q.answer}.`;
    }

    q = nextQuestion(Math.random);
    questionEl.textContent = q.text;
    input.value = "";
  });

  function finish() {
    clearInterval(tick);
    input.disabled = true;
    done.disabled = true;

    // Save best score
    const next = ctx.getState();
    next.games.quickmath.best = Math.max(next.games.quickmath.best || 0, score);
    next.games.quickmath.last = { score, at: Date.now() };
    ctx.setState(next);

    // Mark quest completion
    ctx.onQuestComplete({ gameId: "quickmath", points: score });

    msg.textContent = `Run complete. Score: ${score}.`;
  }
}

function statBox(label, valueNode) {
  return el("div", { class: "po-stat" }, [
    el("div", { class: "po-stat-label" }, [label]),
    valueNode,
  ]);
}

function nextQuestion(rand) {
  // Slightly adaptive question difficulty
  const ops = ["+", "-", "×"];
  const op = ops[Math.floor(rand() * ops.length)];

  let a = 0, b = 0, ans = 0, text = "";
  let points = 1;

  if (op === "+") {
    a = int(rand, 5, 60);
    b = int(rand, 5, 60);
    ans = a + b;
    points = 1;
    text = `${a} + ${b} = ?`;
  } else if (op === "-") {
    a = int(rand, 10, 90);
    b = int(rand, 1, a);
    ans = a - b;
    points = 2;
    text = `${a} − ${b} = ?`;
  } else {
    a = int(rand, 2, 12);
    b = int(rand, 2, 12);
    ans = a * b;
    points = 3;
    text = `${a} × ${b} = ?`;
  }

  return { text, answer: ans, points };
}

function int(rand, min, max) {
  return Math.floor(rand() * (max - min + 1)) + min;
}

/**
 * Daily runner for "Daily Voyage"
 * Mounts a shorter version with deterministic questions.
 */
export async function runDailyQuickMath(root, ctx) {
  clear(root);

  const key = dayKey();
  const seed = hashStringToSeed(`po-daily-qm-${key}`);
  const rng = seededRng(seed);

  const wrap = el("div", {}, [
    sectionTitle("Daily Voyage — Storm Sprint", "Short run. Deterministic. One attempt is enough."),
  ]);

  const panel = el("div", { class: "mt-4" }, []);
  wrap.append(panel);
  root.append(wrap);

  // Shorter daily: 12 questions max, no timer
  const QUESTIONS = 12;
  let score = 0;
  let i = 0;
  let q = nextQuestion(rng);

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

      if (n === q.answer) score += q.points;

      i++;
      if (i >= QUESTIONS) {
        input.disabled = true;

        const next = ctx.getState();
        next.games.quickmath.best = Math.max(next.games.quickmath.best || 0, score);
        ctx.setState(next);

        resolve({ completed: true, score });
        return;
      }

      q = nextQuestion(rng);
      questionEl.textContent = q.text;
      input.value = "";
      meter.textContent = `Question ${i + 1} / ${QUESTIONS}`;
    });
  });
}
