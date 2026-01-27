/**
 * wordle.js — Word Voyage (upgraded)
 * - Words loaded from JSON pack (no hardcoded list in code)
 * - Correct Wordle coloring (handles repeated letters)
 * - On-screen keyboard + typing
 * - Deterministic daily word via dayKey + seeded RNG
 */
import { el, clear, sectionTitle } from "../lib/ui.js";
import { dayKey, hashStringToSeed, seededRng } from "../lib/rng.js";
import { loadJsonPack } from "../lib/packs.js";

const PACK_URL = "/arcade/packs/wordle-words.json";

export function mountWordle(root, ctx) {
  const wrap = el("div", {}, [
    sectionTitle("Word Voyage", "Guess the 5-letter word. Each guess is a step closer to Ithaca."),
  ]);

  const panel = el("div", { class: "mt-4" }, []);
  const playBtn = el("button", { class: "po-btn po-btn-primary", type: "button" }, ["Play today"]);
  playBtn.addEventListener("click", async () => {
    clear(panel);
    const loading = el("div", { class: "po-muted" }, ["Loading voyage…"]);
    panel.append(loading);
    try {
      const pack = await loadJsonPack(PACK_URL);
      await runToday(panel, ctx, pack);
    } catch (e) {
      clear(panel);
      panel.append(el("div", { class: "po-muted" }, [`Word pack missing: ${PACK_URL}`]));
    }
  });

  wrap.append(playBtn, panel);
  root.append(wrap);
}

function pickDailyWord(words, key) {
  const seed = hashStringToSeed(`po-daily-word-${key}`);
  const rng = seededRng(seed);
  return words[Math.floor(rng() * words.length)];
}

function scoreGuess(guess, target) {
  // returns array of "correct" | "present" | "absent"
  const res = Array(5).fill("absent");
  const t = target.split("");
  const g = guess.split("");

  // first pass: correct
  const used = Array(5).fill(false);
  for (let i = 0; i < 5; i++) {
    if (g[i] === t[i]) {
      res[i] = "correct";
      used[i] = true;
      t[i] = null;
    }
  }

  // second pass: present (respect counts)
  for (let i = 0; i < 5; i++) {
    if (res[i] === "correct") continue;
    const idx = t.indexOf(g[i]);
    if (idx !== -1) {
      res[i] = "present";
      t[idx] = null;
    }
  }

  return res;
}

function renderGrid(gridNode, guesses, target, revealedCount) {
  clear(gridNode);
  const rows = 6;

  for (let r = 0; r < rows; r++) {
    const guess = guesses[r] || "";
    const submitted = r < revealedCount && guess.length === 5;
    const scores = submitted ? scoreGuess(guess, target) : null;

    const row = el("div", { style: "display:grid;grid-template-columns:repeat(5,1fr);gap:8px;margin:8px 0;" }, []);
    for (let c = 0; c < 5; c++) {
      const ch = guess[c] || "";
      const box = el("div", {
        style:
          "height:52px;border-radius:12px;display:flex;align-items:center;justify-content:center;" +
          "font-weight:900;font-size:18px;border:1px solid rgba(15,23,42,0.14);background:rgba(255,255,255,0.8);",
      }, [ch]);

      if (submitted) {
        const s = scores[c];
        if (s === "correct") {
          box.style.background = "rgba(34,197,94,0.20)";
          box.style.borderColor = "rgba(34,197,94,0.55)";
        } else if (s === "present") {
          box.style.background = "rgba(234,179,8,0.20)";
          box.style.borderColor = "rgba(234,179,8,0.55)";
        } else {
          box.style.background = "rgba(148,163,184,0.18)";
          box.style.borderColor = "rgba(148,163,184,0.40)";
        }
      }

      row.append(box);
    }
    gridNode.append(row);
  }
}

function keyboardLayout() {
  return ["QWERTYUIOP", "ASDFGHJKL", "ZXCVBNM"];
}

function computeKeyState(guesses, target) {
  // priority: correct > present > absent
  const map = new Map();
  for (const g of guesses) {
    if (g.length !== 5) continue;
    const s = scoreGuess(g, target);
    for (let i = 0; i < 5; i++) {
      const ch = g[i];
      const v = s[i];
      const cur = map.get(ch);
      const rank = (x) => (x === "correct" ? 3 : x === "present" ? 2 : x === "absent" ? 1 : 0);
      if (!cur || rank(v) > rank(cur)) map.set(ch, v);
    }
  }
  return map;
}

async function runToday(panel, ctx, pack) {
  clear(panel);

  const words = (pack?.words || []).map(w => String(w).slice(0, 5).toUpperCase()).filter(w => /^[A-Z]{5}$/.test(w));
  if (!words.length) {
    panel.append(el("div", { class: "po-muted" }, ["Word pack has no valid 5-letter words."]));
    return;
  }

  const key = dayKey();
  const target = pickDailyWord(words, key);
  const valid = new Set(words);

  const state = ctx.getState();
  const saved = state.games.wordle;
  const savedSameDay = saved.lastKey === key && Array.isArray(saved.lastGrid) && typeof saved.revealedCount === "number";

  let guesses = savedSameDay ? [...saved.lastGrid] : [];
  let revealedCount = savedSameDay ? saved.revealedCount : 0;
  let done = false;

  const grid = el("div", {});
  const msg = el("div", { class: "po-muted", style: "margin-top:10px;" }, ["Type a 5-letter word, then Enter."]);
  const input = el("input", {
    type: "text",
    maxlength: "5",
    autocomplete: "off",
    class: "mt-3 w-full px-4 py-3 rounded-xl border border-slate-200",
    "aria-label": "Type a 5-letter word guess",
  });

  const kb = el("div", { style: "margin-top:12px;display:grid;gap:8px;" }, []);
  const kbButtons = new Map();

  function renderKeyboard() {
    clear(kb);
    const ks = computeKeyState(guesses.slice(0, revealedCount), target);
    for (const row of keyboardLayout()) {
      const rowEl = el("div", { style: "display:flex;gap:8px;justify-content:center;flex-wrap:wrap;" }, []);
      for (const ch of row.split("")) {
        const st = ks.get(ch);
        const b = el("button", {
          type: "button",
          class: "po-btn",
          style: "height:40px;min-width:40px;padding:0 10px;",
        }, [ch]);

        if (st === "correct") b.style.background = "rgba(34,197,94,0.22)";
        if (st === "present") b.style.background = "rgba(234,179,8,0.22)";
        if (st === "absent") b.style.opacity = "0.55";

        b.addEventListener("click", () => {
          if (done) return;
          if ((input.value || "").length >= 5) return;
          input.value = (input.value || "") + ch;
          input.focus();
        });

        kbButtons.set(ch, b);
        rowEl.append(b);
      }
      kb.append(rowEl);
    }

    const actions = el("div", { style: "display:flex;gap:10px;justify-content:center;flex-wrap:wrap;" }, [
      el("button", { type: "button", class: "po-btn po-btn-ghost", onClick: () => { if (!done) input.value = (input.value || "").slice(0, -1); } }, ["⌫"]),
      el("button", { type: "button", class: "po-btn po-btn-primary", onClick: () => submit() }, ["Enter"]),
    ]);
    kb.append(actions);
  }

  function persist() {
    const next = ctx.getState();
    next.games.wordle.lastKey = key;
    next.games.wordle.lastGrid = guesses;
    next.games.wordle.revealedCount = revealedCount;
    ctx.setState(next);
  }

  function submit() {
    if (done) return;
    const g = (input.value || "").trim().toUpperCase();
    if (g.length !== 5) { msg.textContent = "Needs 5 letters."; return; }
    if (!valid.has(g)) { msg.textContent = "Not in the voyage lexicon."; return; }

    // Save guess in next slot (if user edits earlier, keep it simple: append)
    guesses.push(g);
    revealedCount = guesses.length;
    input.value = "";

    renderGrid(grid, guesses, target, revealedCount);
    renderKeyboard();
    persist();

    if (g === target) {
      done = true;
      msg.textContent = "🏛️ You reached Ithaca. Victory.";
      const s2 = ctx.getState();
      s2.games.wordle.wins += 1;
      s2.games.wordle.plays += 1;
      ctx.setState(s2);
      return;
    }

    if (guesses.length >= 6) {
      done = true;
      msg.textContent = `Voyage ended. The word was ${target}.`;
      const s2 = ctx.getState();
      s2.games.wordle.plays += 1;
      ctx.setState(s2);
      return;
    }

    msg.textContent = "Next step…";
  }

  renderGrid(grid, guesses, target, revealedCount);
  renderKeyboard();

  panel.append(grid, input, msg, kb);
  input.focus();

  input.addEventListener("keydown", (e) => {
    if (e.key === "Enter") submit();
  });
}

/** Daily runner */
export async function runDailyWordle(root, ctx) {
  const panel = document.createElement("div");
  root.append(
    el("div", {}, [
      sectionTitle("Daily Voyage — Word Voyage", "Same word for everyone, per day (on this device)."),
      panel,
    ])
  );

  const pack = await loadJsonPack(PACK_URL);
  await runToday(panel, ctx, pack);
  return { completed: true };
}