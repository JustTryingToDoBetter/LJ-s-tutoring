/**
 * quickmath.js — Storm Sprint (Quick Math)
 * - Shared Game Frame (ctx.ui)
 * - Lifecycle-based (init/pause/resume/destroy)
 * - Shared arcade storage schema (stats, best today)
 */
import { el, clear } from "../lib/ui.js";
import { dayKey, hashStringToSeed, seededRng } from "../lib/rng.js";
import { loadJsonPack } from "../lib/packs.js";

const GAME_ID = "quickmath";
const RULES_URL = "/arcade/packs/quickmath-rules.json";
const DURATION_MS = 45_000;
const TICK_MS = 200;

function makeRunState() {
  return {
    running: false,
    paused: false,
    startAt: 0,
    elapsedMs: 0,
    score: 0,
    streak: 0,
    answered: 0,
    question: null,
  };
}

function formatTime(ms) {
  return String(Math.max(0, Math.ceil(ms / 1000)));
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
  let a = 0;
  let b = 0;
  let ans = 0;
  let text = "";
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

function lerp(a, b, t) {
  return a + (b - a) * t;
}

function weightedPick(table, rng) {
  const total = table.reduce((s, x) => s + (x.w ?? 1), 0);
  let r = rng() * total;
  for (const x of table) {
    r -= (x.w ?? 1);
    if (r <= 0) return x.item;
  }
  return table[table.length - 1].item;
}

const QuickMath = {
  _ctx: null,
  _ui: null,
  _store: null,
  _rules: null,
  _rng: null,
  _state: null,
  _timerOff: null,
  _elements: null,

  async init(ctx) {
    this._ctx = ctx;
    this._ui = ctx.ui;
    this._store = ctx.store;

    clear(ctx.root);

    const state = makeRunState();
    this._state = state;

    const panel = el("section", { class: "po-arcade__panel po-animate-in" });
    const intro = el("div", { class: "po-muted", text: "Answer fast. Build a streak. Beat your best." });
    const help = el("div", { class: "po-muted", text: "How to play: type the answer and press Enter. Faster streaks earn more points." });
    const summary = el("div", { class: "po-game__status", style: "margin-top:8px;" });
    const body = el("div", { style: "margin-top:12px;" });
    panel.append(intro, help, summary, body);
    ctx.root.append(panel);

    const startBtn = el("button", { class: "po-btn po-btn--primary", type: "button" }, ["Start Sprint"]);
    const pauseBtn = el("button", { class: "po-btn", type: "button", disabled: true }, ["Pause"]);
    const restartBtn = el("button", { class: "po-btn", type: "button", disabled: true }, ["Restart"]);

    const controlsRow = el("div", { class: "po-pillrow" }, [startBtn, pauseBtn, restartBtn]);
    this._ui?.setControls?.(controlsRow);

    this._ui?.setStatus?.("Loading rules…");

    try {
      this._rules = await loadJsonPack(RULES_URL);
    } catch {
      this._ui?.setStatus?.(`Rules pack missing: ${RULES_URL}`);
      summary.textContent = "";
      return;
    }

    const storeState = this._store?.get?.() || {};
    const stats = storeState.games?.[GAME_ID] || {};
    const today = dayKey();
    const bestToday = stats.dailyBest?.dayKey === today ? stats.dailyBest.score : null;
    summary.textContent = `Best score: ${stats.best || 0} · Best today: ${bestToday ?? "—"}`;

    const renderRun = () => {
      clear(body);

      const timerEl = el("div", { class: "po-stat-value", "aria-live": "polite" }, [formatTime(DURATION_MS - state.elapsedMs)]);
      const scoreEl = el("div", { class: "po-stat-value" }, [String(state.score)]);
      const streakEl = el("div", { class: "po-stat-value" }, [String(state.streak)]);

      const statsRow = el("div", { class: "po-stats" }, [
        statBox("Time", timerEl),
        statBox("Score", scoreEl),
        statBox("Streak", streakEl),
      ]);

      const questionEl = el("div", { class: "po-qm-question", text: state.question?.text || "" });
      const input = el("input", {
        type: "text",
        inputmode: "numeric",
        autocomplete: "off",
        class: "po-input",
        "aria-label": "Type your answer",
      });

      const hintText = el("div", { class: "po-game__status", style: "margin-top:10px;" }, ["Press Enter to submit."]);

      body.append(statsRow, el("div", { style: "margin-top:12px;" }, [questionEl]), input, hintText);
      input.focus();

      this._elements = { timerEl, scoreEl, streakEl, questionEl, input, hintText };

      ctx.addEvent(input, "keydown", (e) => {
        if (e.key !== "Enter") return;
        submitAnswer();
      });
    };

    const updateHud = () => {
      const storeSnapshot = this._store?.get?.() || {};
      const qm = storeSnapshot.games?.[GAME_ID] || {};
      const todayKey = dayKey();
      const bestTodayScore = qm.dailyBest?.dayKey === todayKey ? qm.dailyBest.score : "—";
      this._ui?.setHUD?.([
        { k: "Time", v: formatTime(DURATION_MS - state.elapsedMs) },
        { k: "Score", v: String(state.score) },
        { k: "Streak", v: String(state.streak) },
        { k: "Best", v: String(qm.best || 0) },
        { k: "Today", v: String(bestTodayScore) },
      ]);
    };

    const updateTimer = () => {
      if (!state.running || state.paused) return;
      state.elapsedMs = Math.min(DURATION_MS, performance.now() - state.startAt);
      if (this._elements?.timerEl) this._elements.timerEl.textContent = formatTime(DURATION_MS - state.elapsedMs);
      if (state.elapsedMs >= DURATION_MS) finishRun();
      updateHud();
    };

    const beginRun = () => {
      state.running = true;
      state.paused = false;
      state.elapsedMs = 0;
      state.score = 0;
      state.streak = 0;
      state.answered = 0;
      state.startAt = performance.now();

      const seed = hashStringToSeed(`po-qm-run-${Date.now()}`);
      this._rng = seededRng(seed);
      state.question = nextQuestion(this._rules, this._rng, { streak: state.streak });

      startBtn.disabled = true;
      pauseBtn.disabled = false;
      restartBtn.disabled = false;
      pauseBtn.textContent = "Pause";

      renderRun();
      this._ui?.setStatus?.("Press Enter to submit.");
      updateHud();
    };

    const submitAnswer = () => {
      const input = this._elements?.input;
      if (!input || state.paused || !state.running) return;
      const val = input.value.trim();
      if (!val) return;

      const n = Number(val);
      if (!Number.isFinite(n)) return;

      state.answered += 1;

      if (n === state.question.answer) {
        state.streak += 1;
        const mult = 1 + Math.min(2.5, state.streak * 0.08);
        const gained = Math.floor(state.question.points * mult);
        state.score += gained;
        this._ui?.setStatus?.(`✅ Clean strike (+${gained}).`);
      } else {
        this._ui?.setStatus?.(`❌ Miss. Correct was ${state.question.answer}.`);
        state.streak = Math.max(0, Math.floor(state.streak * 0.4));
      }

      if (this._elements?.scoreEl) this._elements.scoreEl.textContent = String(state.score);
      if (this._elements?.streakEl) this._elements.streakEl.textContent = String(state.streak);

      state.question = nextQuestion(this._rules, this._rng, { streak: state.streak });
      if (this._elements?.questionEl) this._elements.questionEl.textContent = state.question.text;
      input.value = "";
      updateHud();
    };

    const finishRun = () => {
      state.running = false;
      pauseBtn.disabled = true;
      pauseBtn.textContent = "Pause";

      const todayKey = dayKey();
      this._store?.updateGame?.(GAME_ID, (g) => {
        const best = Math.max(g.best || 0, state.score);
        const daily = g.dailyBest;
        const nextDaily = (!daily || daily.dayKey !== todayKey || state.score > (daily.score || 0))
          ? { dayKey: todayKey, score: state.score }
          : daily;
        return {
          best,
          dailyBest: nextDaily,
          plays: (g.plays || 0) + 1,
          lastPlayed: Date.now(),
          last: { score: state.score, streak: state.streak, answered: state.answered, at: Date.now() },
        };
      });

      const storeState = this._store?.get?.() || {};
      const stats = storeState.games?.[GAME_ID] || {};
      const bestTodayScore = stats.dailyBest?.dayKey === todayKey ? stats.dailyBest.score : "—";
      summary.textContent = `Best score: ${stats.best || 0} · Best today: ${bestTodayScore}`;

      this._ui?.setStatus?.(`Run complete. Score: ${state.score}.`);
      updateHud();
    };

    const togglePause = () => {
      if (!state.running) return;
      state.paused = !state.paused;
      pauseBtn.textContent = state.paused ? "Resume" : "Pause";
      if (state.paused) {
        state.elapsedMs = Math.min(DURATION_MS, performance.now() - state.startAt);
        this._ui?.setStatus?.("Paused.");
      } else {
        state.startAt = performance.now() - state.elapsedMs;
        this._ui?.setStatus?.("Back to it.");
      }
      updateHud();
    };

    const restartRun = () => {
      if (!this._rules) return;
      state.running = false;
      state.paused = false;
      beginRun();
    };

    ctx.addEvent(startBtn, "click", beginRun);
    ctx.addEvent(pauseBtn, "click", togglePause);
    ctx.addEvent(restartBtn, "click", restartRun);

    this._timerOff = ctx.interval(updateTimer, TICK_MS);

    this._ui?.setStatus?.("Ready when you are.");
    updateHud();
  },

  pause() {
    if (!this._state?.running || this._state.paused) return;
    this._state.paused = true;
    this._ui?.setStatus?.("Paused.");
  },

  resume() {
    if (!this._state?.running || !this._state.paused) return;
    this._state.paused = false;
    this._state.startAt = performance.now() - this._state.elapsedMs;
    this._ui?.setStatus?.("Back to it.");
  },

  destroy() {
    this._timerOff = null;
    this._rules = null;
    this._rng = null;
    this._elements = null;
    this._state = null;
    this._ui?.setHUD?.([]);
    this._ui?.setControls?.(null);
    this._ui?.setStatus?.("");
  },
};

export default QuickMath;

function statBox(label, valueNode) {
  return el("div", { class: "po-stat" }, [
    el("div", { class: "po-stat-label", text: label }),
    valueNode,
  ]);
}

