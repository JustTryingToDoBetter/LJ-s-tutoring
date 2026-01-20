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

  const rows = 6;
  for (let r = 0; r < rows; r++) {
    const guess = guesses[r] || "";
    const row = el("div", { style: "display:grid;grid-template-columns:repeat(5,1fr);gap:8px;margin:8px 0;" }, []);
    for (let c = 0; c < 5; c++) {
      const ch = guess[c] || "";
      const box = el("div", {
        style:
          "height:52px;border-radius:12px;display:flex;align-items:center;justify-content:center;" +
          "font-weight:900;font-size:18px;border:1px solid rgba(15,23,42,0.14);background:rgba(255,255,255,0.8);",
      }, [ch]);

      // Color feedback for submitted guesses only
      if (guess.length === 5) {
        const t = target;
        const isCorrect = ch === t[c];

        // Count letters for simple present logic
        const present = !isCorrect && t.includes(ch);

        if (isCorrect) {
          box.style.background = "rgba(34,197,94,0.20)";   // green tint
          box.style.borderColor = "rgba(34,197,94,0.55)";
        } else if (present) {
          box.style.background = "rgba(234,179,8,0.20)";   // gold tint
          box.style.borderColor = "rgba(234,179,8,0.55)";
        } else {
          box.style.background = "rgba(148,163,184,0.18)"; // gray tint
          box.style.borderColor = "rgba(148,163,184,0.40)";
        }
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

  const grid = el("div", {});
  const msg = el("div", { class: "po-muted", style: "margin-top:10px;" }, ["Type a 5-letter word, then Enter."]);
  const input = el("input", {
    type: "text",
    maxlength: "5",
    autocomplete: "off",
    class: "mt-3 w-full px-4 py-3 rounded-xl border border-slate-200",
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
