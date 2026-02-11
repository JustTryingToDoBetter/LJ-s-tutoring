/**
 * Wordle — "Oracle Word" (Module lifecycle version)
 * - Shared Game Frame (ctx.ui)
 * - AbortController cleanup (events)
 * - Deterministic Daily word + Endless mode
 * - Mobile-first grid + on-screen keyboard
 *
 * Pack format (example):
 * {
 *   "answers": ["ODYSSEUS", "ATHENA", ...],   // 5-letter only preferred, but we filter anyway
 *   "allowed": ["..."]                       // optional; if missing, answers are allowed guesses
 * }
 */

import { el, clear } from "../lib/ui.js";
import { dayKey, hashStringToSeed, seededRng } from "../lib/rng.js";
import { loadJsonPack } from "../lib/packs.js";

const STORAGE_KEY = "po_arcade_wordle_v3";
const PACK_URL = "/assets/data/words-5.json";

const load = () => { try { return JSON.parse(localStorage.getItem(STORAGE_KEY) || "null"); } catch { return null; } };
const save = (s) => { try { localStorage.setItem(STORAGE_KEY, JSON.stringify(s)); } catch {} };
const clearSave = () => { try { localStorage.removeItem(STORAGE_KEY); } catch {} };

function toWord(s) {
  return String(s || "").toUpperCase().replace(/[^A-Z]/g, "");
}
function isFive(s) {
  return typeof s === "string" && s.length === 5 && /^[A-Z]{5}$/.test(s);
}

async function loadPack(signal) {
  return loadJsonPack(PACK_URL, { signal });
}

function normalizePack(pack) {
  const rawAnswers = Array.isArray(pack?.answers) ? pack.answers : Array.isArray(pack?.words) ? pack.words : [];
  const answers = rawAnswers.map(toWord).filter(isFive);
  const allowedRaw = Array.isArray(pack?.allowed) ? pack.allowed : [];
  const allowed = allowedRaw.map(toWord).filter(isFive);

  // If no allowed list, allow answers as guesses.
  const allowedSet = new Set((allowed.length ? allowed : answers));
  const answerSet = new Set(answers);

  return { answers, allowedSet, answerSet };
}

function pickDaily(answers) {
  const rng = seededRng(hashStringToSeed(`po-wordle-daily-${dayKey()}`));
  return answers[Math.floor(rng() * answers.length)];
}

function pickEndless(answers) {
  const seed = `${Date.now()}-${Math.random()}`;
  const rng = seededRng(hashStringToSeed(`po-wordle-endless-${seed}`));
  return answers[Math.floor(rng() * answers.length)];
}

function freshState(mode, answer) {
  return {
    v: 3,
    mode,            // daily | endless
    day: dayKey(),
    answer,          // 5 letters
    rows: [],        // [{ guess:"", marks:[0..2] }]
    current: "",     // typing buffer
    maxRows: 6,
    done: false,
    won: false,
    status: "Type a 5-letter word.",
  };
}

// marks: 2=correct, 1=present, 0=absent
function scoreGuess(guess, answer) {
  const g = guess.split("");
  const a = answer.split("");
  const marks = Array(5).fill(0);

  // pass 1: exact
  const freq = {};
  for (let i = 0; i < 5; i++) {
    if (g[i] === a[i]) {
      marks[i] = 2;
    } else {
      freq[a[i]] = (freq[a[i]] || 0) + 1;
    }
  }

  // pass 2: present elsewhere
  for (let i = 0; i < 5; i++) {
    if (marks[i] === 2) continue;
    const ch = g[i];
    if (freq[ch] > 0) {
      marks[i] = 1;
      freq[ch]--;
    }
  }

  return marks;
}

function mergeKeyState(map, guess, marks) {
  // map[ch] = 0|1|2 best-known
  for (let i = 0; i < 5; i++) {
    const ch = guess[i];
    const m = marks[i];
    const prev = map.get(ch) ?? -1;
    if (m > prev) map.set(ch, m);
  }
}

export default {
  _ac: null,
  _root: null,
  _ctx: null,
  _pack: null,

  init(ctx) {
    return this.mount(ctx.root, ctx);
  },

  async mount(root, ctx) {
    this._root = root;
    this._ctx = ctx;

    clear(root);

    this._ac = new AbortController();
    const { signal } = this._ac;

    const ui = ctx.ui;
    const storage = ctx.storage;
    let resultRecorded = false;

    ui?.setHUD?.([{ k: "Mode", v: "…" }, { k: "Row", v: "…" }, { k: "Pack", v: "Loading" }]);
    ui?.setStatus?.("Loading word pack…");

    let pack;
    try {
      pack = normalizePack(await loadPack(signal));
    } catch {
      ui?.setHUD?.([{ k: "Pack", v: "Missing" }]);
      ui?.setStatus?.(`Word pack missing: ${PACK_URL}`);
      return;
    }

    if (!pack.answers.length) {
      ui?.setHUD?.([{ k: "Pack", v: "Empty" }]);
      ui?.setStatus?.("Wordle pack has no valid 5-letter answers.");
      return;
    }

    this._pack = pack;

    // Restore or create state
    const restored = load();
    let state =
      restored?.v === 3 && isFive(restored?.answer)
        ? restored
        : freshState("daily", pickDaily(pack.answers));

    // Ensure daily resets per day
    if (state.mode === "daily" && state.day !== dayKey()) {
      state = freshState("daily", pickDaily(pack.answers));
    }

    // Controls
    const modeSelect = el("select", { class: "po-select", "aria-label": "Select Wordle mode" }, [
      el("option", { value: "daily", text: "Daily" }),
      el("option", { value: "endless", text: "Endless" }),
    ]);
    modeSelect.value = state.mode;

    const enterBtn = el("button", { class: "po-btn po-btn--primary", type: "button" }, ["Enter"]);
    const backBtn = el("button", { class: "po-btn", type: "button" }, ["Back"]);
    const newBtn = el("button", { class: "po-btn", type: "button" }, ["New Word"]);
    const clearBtn = el("button", { class: "po-btn po-btn--ghost", type: "button" }, ["Clear Save"]);

    const controlsRow = el("div", { class: "po-pillrow" }, [modeSelect, enterBtn, backBtn, newBtn, clearBtn]);
    ui?.setControls?.(controlsRow);

    // Stage
    const wrap = el("div", { class: "po-wd-wrap" });
    const grid = el("div", { class: "po-wd-grid", role: "grid", "aria-label": "Wordle grid" });
    const kb = el("div", { class: "po-wd-kb", role: "group", "aria-label": "Wordle keyboard" });

    wrap.append(grid, kb);
    root.append(wrap);

    // Keyboard layout
    const rows = ["QWERTYUIOP", "ASDFGHJKL", "ZXCVBNM"];
    const btns = new Map();
    const keyState = new Map(); // ch -> 0|1|2
    const usedWords = new Set();

    const mkKey = (label, cls = "") => el("button", { class: `po-btn po-wd-key ${cls}`.trim(), type: "button" }, [label]);

    const topRow = el("div", { class: "po-wd-kbrow" });
    const midRow = el("div", { class: "po-wd-kbrow" });
    const botRow = el("div", { class: "po-wd-kbrow" });

    const rowEls = [topRow, midRow, botRow];

    rows.forEach((letters, r) => {
      for (const ch of letters) {
        const b = mkKey(ch);
        b.setAttribute("aria-label", `Type ${ch}`);
        b.addEventListener("click", () => typeChar(ch), { signal });
        btns.set(ch, b);
        rowEls[r].append(b);
      }
    });

    const enterKey = mkKey("Enter", "po-wd-key--wide");
    const backKey = mkKey("⌫", "po-wd-key--wide");
    enterKey.addEventListener("click", () => commit(), { signal });
    backKey.addEventListener("click", () => backspace(), { signal });

    botRow.prepend(enterKey);
    botRow.append(backKey);

    kb.append(topRow, midRow, botRow);

    const persist = () => save(state);

    const setHud = () => {
      ui?.setHUD?.([
        { k: "Mode", v: state.mode === "daily" ? "Daily" : "Endless" },
        { k: "Row", v: `${Math.min(state.rows.length + 1, state.maxRows)}/${state.maxRows}` },
        { k: "Left", v: String(Math.max(0, state.maxRows - state.rows.length)) },
      ]);
    };

    const setStatus = (t) => ui?.setStatus?.(t);

    const renderGrid = () => {
      clear(grid);

      for (let r = 0; r < state.maxRows; r++) {
        const row = el("div", { class: "po-wd-row", role: "row" });
        const entry = state.rows[r];

        const guess = entry?.guess || (r === state.rows.length ? state.current : "");
        const marks = entry?.marks || null;

        for (let i = 0; i < 5; i++) {
          const ch = guess[i] || "";
          const tile = el("div", { class: "po-wd-tile", role: "gridcell" }, [ch]);
          if (marks) tile.setAttribute("data-m", String(marks[i])); // 0|1|2
          row.append(tile);
        }
        grid.append(row);
      }
    };

    const renderKeyboard = () => {
      for (const [ch, b] of btns.entries()) {
        const m = keyState.get(ch);
        b.removeAttribute("data-m");
        if (m != null) b.setAttribute("data-m", String(m));
        b.disabled = state.done || m === 0;
      }
      enterKey.disabled = state.done;
      backKey.disabled = state.done;
    };

    const renderAll = () => {
      setHud();
      setStatus(state.status);
      renderGrid();
      renderKeyboard();
      persist();
    };

    const resetKeyStateFromRows = () => {
      keyState.clear();
      usedWords.clear();
      for (const row of state.rows) {
        mergeKeyState(keyState, row.guess, row.marks);
        usedWords.add(row.guess);
      }
    };

    const finishIfNeeded = () => {
      if (state.done) return;

      const last = state.rows[state.rows.length - 1];
      if (last?.guess === state.answer) {
        state.done = true;
        state.won = true;
        state.status = "Victory — the Oracle yields.";
        recordResult();
        return;
      }
      if (state.rows.length >= state.maxRows) {
        state.done = true;
        state.won = false;
        state.status = `Defeat — the word was ${state.answer}.`;
        recordResult();
      }
    };

    const recordResult = () => {
      if (resultRecorded || !storage?.get || !storage?.update) return;
      const stats = storage.get();
      storage.update({
        wins: stats.wins + (state.won ? 1 : 0),
        losses: stats.losses + (state.won ? 0 : 1),
      });
      resultRecorded = true;
    };

    const typeChar = (ch) => {
      if (state.done) return;
      if (state.current.length >= 5) return;
      state.current += ch;
      state.status = "Keep going…";
      renderAll();
    };

    const backspace = () => {
      if (state.done) return;
      if (!state.current.length) return;
      state.current = state.current.slice(0, -1);
      state.status = "Edit your guess.";
      renderAll();
    };

    const commit = () => {
      if (state.done) return;
      if (state.current.length !== 5) {
        state.status = "Need 5 letters.";
        renderAll();
        return;
      }

      const guess = state.current;
      if (usedWords.has(guess)) {
        state.status = "Already tried that word.";
        renderAll();
        return;
      }
      if (!pack.allowedSet.has(guess)) {
        state.status = "Not in word list.";
        renderAll();
        return;
      }

      const marks = scoreGuess(guess, state.answer);
      state.rows.push({ guess, marks });
      state.current = "";

      mergeKeyState(keyState, guess, marks);
      usedWords.add(guess);

      state.status = guess === state.answer ? "Perfect." : "Next guess.";
      finishIfNeeded();
      renderAll();
    };

    // Buttons
    modeSelect.addEventListener("change", () => {
      const mode = modeSelect.value;
      state = freshState(mode, mode === "daily" ? pickDaily(pack.answers) : pickEndless(pack.answers));
      resetKeyStateFromRows();
      renderAll();
    }, { signal });

    enterBtn.addEventListener("click", () => commit(), { signal });
    backBtn.addEventListener("click", () => backspace(), { signal });

    newBtn.addEventListener("click", () => {
      if (state.mode === "daily") {
        state = freshState("daily", pickDaily(pack.answers));
      } else {
        state = freshState("endless", pickEndless(pack.answers));
      }
      resetKeyStateFromRows();
      renderAll();
    }, { signal });

    clearBtn.addEventListener("click", () => {
      clearSave();
      state = freshState("daily", pickDaily(pack.answers));
      modeSelect.value = "daily";
      resetKeyStateFromRows();
      renderAll();
    }, { signal });

    // Physical keyboard
    window.addEventListener("keydown", (e) => {
      if (state.done) return;

      const k = String(e.key || "");
      if (k === "Enter") { commit(); return; }
      if (k === "Backspace") { backspace(); return; }

      const ch = k.toUpperCase();
      if (ch.length === 1 && ch >= "A" && ch <= "Z") typeChar(ch);
    }, { signal });

    // Initial render
    resetKeyStateFromRows();
    renderAll();
  },

  destroy() {
    try { this._ac?.abort?.(); } catch {}
    this._ac = null;

    try { this._ctx?.ui?.setControls?.(null); } catch {}
    try { this._ctx?.ui?.setStatus?.(""); } catch {}
    try { this._ctx?.ui?.setHUD?.([]); } catch {}

    if (this._root) {
      try { clear(this._root); } catch {}
    }

    this._pack = null;
    this._root = null;
    this._ctx = null;
  },

  resize() {},
  pause() {},
  resume() {},
};