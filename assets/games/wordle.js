/**
 * wordle.js
 * "Word Voyage" – 5-letter guessing game.
 * Production notes:
 * - Uses an internal word list (small). You can expand it anytime.
 * - Deterministic daily word via seeded RNG.
 * - Local persistence for stats and today's grid.
 */

import { el, clear, sectionTitle } from "../lib/ui.js";
import { dayKey, hashStringToSeed, seededRng } from "../lib/rng.js";

const WORDS = [
  "ODDYS", "ATLAS", "QUEST", "SWORD", "SHORE", "STORM", "ROUTE", "MYTHS",
  "TITAN", "VOICE", "BRAVE", "TRUTH", "GLORY", "HEROE", "ARROW", "MAGIC",
].map(w => w.slice(0, 5).toUpperCase());

const VALID = new Set(WORDS);

export function mountWordle(root, ctx) {
  const wrap = el("div", {}, [
    sectionTitle("Word Voyage", "Guess the 5-letter word. Each guess is a step closer to Ithaca."),
  ]);

  const playBtn = el("button", { class: "po-btn po-btn-primary", type: "button" }, ["Play today"]);
  const panel = el("div", { class: "mt-4" }, []);

  playBtn.addEventListener("click", () => runToday(panel, ctx, false));
  wrap.append(playBtn, panel);
  root.append(wrap);
}

function pickDailyWord(key) {
  const seed = hashStringToSeed(`po-daily-word-${key}`);
  const rng = seededRng(seed);
  return WORDS[Math.floor(rng() * WORDS.length)];
}

function renderGrid(gridNode, guesses, target) {
  clear(gridNode);
  gridNode.className = "po-wd-grid";

  const rows = 6;
  for (let r = 0; r < rows; r++) {
    const guess = guesses[r] || "";
    const row = el("div", { class: "po-wd-row" }, []);

    for (let c = 0; c < 5; c++) {
      const ch = guess[c] || "";
      const box = el("div", { class: "po-wd-cell" }, [ch]);

      if (guess.length === 5) {
        const isCorrect = ch === target[c];
        const present = !isCorrect && target.includes(ch);

        if (isCorrect) box.classList.add("is-correct");
        else if (present) box.classList.add("is-present");
        else box.classList.add("is-absent");
      }

      row.append(box);
    }
    gridNode.append(row);
  }
}

async function runToday(panel, ctx, isDaily) {
  clear(panel);

  const key = dayKey();
  const target = pickDailyWord(key);

  const state = ctx.getState();
  const saved = state.games.wordle;
  const savedSameDay = saved.lastKey === key && Array.isArray(saved.lastGrid);

  let guesses = savedSameDay ? [...saved.lastGrid] : [];
  let done = false;

  const grid = el("div", { class: "po-wd-grid" });
  const msg = el("div", { class: "po-muted", style: "margin-top:10px;" }, ["Type a 5-letter word, then Enter."]);
  const input = el("input", {
    type: "text",
    maxlength: "5",
    autocomplete: "off",
    class: "po-input mt-3",
    "aria-label": "Type a 5-letter word guess",
  });

  renderGrid(grid, guesses, target);
  panel.append(grid, input, msg);

  input.focus();

  return await new Promise((resolve) => {
    input.addEventListener("keydown", (e) => {
      if (done) return;
      if (e.key !== "Enter") return;

      const g = (input.value || "").trim().toUpperCase();
      if (g.length !== 5) { msg.textContent = "Needs 5 letters."; return; }
      if (!VALID.has(g)) { msg.textContent = "Not in the voyage lexicon (word list)."; return; }

      guesses.push(g);
      input.value = "";
      renderGrid(grid, guesses, target);

      // Save progress
      const next = ctx.getState();
      next.games.wordle.lastKey = key;
      next.games.wordle.lastGrid = guesses;
      ctx.setState(next);

      if (g === target) {
        done = true;
        msg.textContent = "🏛️ You reached Ithaca. Victory.";
        const s2 = ctx.getState();
        s2.games.wordle.wins += 1;
        s2.games.wordle.plays += 1;
        s2.games.wordle.lastGrid = guesses;
        ctx.setState(s2);

        resolve({ completed: true, win: true });
        return;
      }

      if (guesses.length >= 6) {
        done = true;
        msg.textContent = `Voyage ended. The word was ${target}.`;
        const s2 = ctx.getState();
        s2.games.wordle.plays += 1;
        ctx.setState(s2);

        resolve({ completed: true, win: false });
        return;
      }

      msg.textContent = "Next step…";
    });
  });
}

/**
 * Daily runner for "Daily Voyage"
 * Reuses runToday (same deterministic word).
 */
export async function runDailyWordle(root, ctx) {
  const panel = document.createElement("div");
  root.append(
    el("div", {}, [
      sectionTitle("Daily Voyage — Word Voyage", "Same word for everyone, per day (on this device)."),
      panel,
    ])
  );

  const result = await runToday(panel, ctx, true);
  return { completed: !!result.completed };
}
