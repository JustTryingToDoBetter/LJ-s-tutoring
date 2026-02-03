/**
 * Hangman — "Gallows of Ithaca" (Module lifecycle version)
 * - Renders inside the shared Game Frame (ctx.ui)
 * - Uses AbortController cleanup (events + fetch)
 * - Uses shared rng helpers for deterministic Daily word
 * - Mobile-first UI with a proper on-screen keyboard
 */

import { el, clear } from "../lib/ui.js";
import { dayKey, hashStringToSeed, seededRng } from "../lib/rng.js";

const STORAGE_KEY = "po_arcade_hangman_v3";
const PACK_URL = "/arcade/packs/hangman-words.json";
const PACK_CACHE_KEY = "po_pack_hangman_v1";

const load = () => { try { return JSON.parse(localStorage.getItem(STORAGE_KEY) || "null"); } catch { return null; } };
const save = (s) => { try { localStorage.setItem(STORAGE_KEY, JSON.stringify(s)); } catch {} };
const clearSave = () => { try { localStorage.removeItem(STORAGE_KEY); } catch {} };

function normalizeEntries(pack) {
  const entries = Array.isArray(pack?.entries) ? pack.entries : [];
  return entries
    .map((x) => ({
      w: String(x?.w || "")
        .toUpperCase()
        .replace(/[^A-Z]/g, ""),
      hint: String(x?.hint || ""),
    }))
    .filter((x) => x.w.length >= 4);
}

function maxWrongFor(word, mode) {
  // longer words get a little more slack; daily is slightly tighter
  const base = 5 + Math.min(3, Math.floor(word.length / 4));
  return mode === "daily" ? Math.max(5, base - 1) : base;
}

async function loadPack(signal) {
  // network -> localStorage cache fallback
  try {
    const res = await fetch(PACK_URL, { cache: "no-cache", signal });
    if (res.ok) {
      const data = await res.json();
      try { localStorage.setItem(PACK_CACHE_KEY, JSON.stringify({ at: Date.now(), data })); } catch {}
      return data;
    }
  } catch {}

  try {
    const raw = localStorage.getItem(PACK_CACHE_KEY);
    const parsed = raw ? JSON.parse(raw) : null;
    if (parsed?.data) return parsed.data;
  } catch {}

  throw new Error("Pack missing");
}

function pickEntry(entries, mode) {
  if (!entries.length) return null;

  if (mode === "daily") {
    const rng = seededRng(hashStringToSeed(`po-hangman-daily-${dayKey()}`));
    return entries[Math.floor(rng() * entries.length)];
  }

  // endless: random per "new word"
  // (not deterministic; feels better for play)
  const seed = `${Date.now()}-${Math.random()}`;
  const rng = seededRng(hashStringToSeed(`po-hangman-endless-${seed}`));
  return entries[Math.floor(rng() * entries.length)];
}

function freshState(entries, mode) {
  const pick = pickEntry(entries, mode) || { w: "ODYSSEUS", hint: "Fallback word" };
  return {
    v: 3,
    mode,
    day: dayKey(), // still stored for reference
    word: pick.w,
    hint: pick.hint,
    guessed: [],
    wrong: 0,
    maxWrong: maxWrongFor(pick.w, mode),
    revealUsed: false,
    done: false,
    won: false,
  };
}

function computeMasked(word, guessed) {
  const set = new Set(guessed);
  return word.split("").map((ch) => (set.has(ch) ? ch : "•")).join(" ");
}

function computeWon(word, guessed) {
  const set = new Set(guessed);
  return word.split("").every((ch) => set.has(ch));
}

export default {
  _ac: null,
  _root: null,
  _ctx: null,
  _entries: null,

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

    // Initial frame status while loading
    ui?.setHUD?.([{ k: "Mode", v: "…" }, { k: "Mistakes", v: "…" }, { k: "Pack", v: "Loading" }]);
    ui?.setStatus?.("Loading word pack…");

    let entries;
    try {
      const pack = await loadPack(signal);
      entries = normalizeEntries(pack);
    } catch {
      ui?.setHUD?.([{ k: "Pack", v: "Missing" }]);
      ui?.setStatus?.(`Word pack missing: ${PACK_URL}`);
      return;
    }

    if (!entries.length) {
      ui?.setHUD?.([{ k: "Pack", v: "Empty" }]);
      ui?.setStatus?.("Hangman pack has no valid entries.");
      return;
    }

    this._entries = entries;

    // Restore or create state
    const restored = load();
    let state =
      restored?.v === 3 && restored?.word && restored?.mode
        ? restored
        : freshState(entries, "daily");

    // Controls (in the frame)
    const modeSelect = el("select", { class: "po-select", "aria-label": "Select Hangman mode" }, [
      el("option", { value: "daily", text: "Daily Word" }),
      el("option", { value: "endless", text: "Endless" }),
    ]);
    modeSelect.value = state.mode || "daily";

    const newBtn = el("button", { class: "po-btn po-btn--primary", type: "button" }, ["New Word"]);
    const revealBtn = el("button", { class: "po-btn", type: "button" }, ["Reveal (1×)"]);
    const clearBtn = el("button", { class: "po-btn po-btn--ghost", type: "button" }, ["Clear Save"]);

    const controlsRow = el("div", { class: "po-pillrow" }, [modeSelect, newBtn, revealBtn, clearBtn]);
    ui?.setControls?.(controlsRow);

    // Stage UI
    const wrap = el("div", { class: "po-hm-wrap" });
    const hintEl = el("div", { class: "po-hm-hint" });
    const wordEl = el("div", { class: "po-hm-word", role: "status", "aria-live": "polite" });
    const metaRow = el("div", { class: "po-hm-meta" });

    const letters = el("div", { class: "po-hm-letters", role: "group", "aria-label": "Letter keyboard" });

    wrap.append(hintEl, wordEl, metaRow, letters);
    root.append(wrap);

    const buttons = new Map();
    for (let i = 65; i <= 90; i++) {
      const ch = String.fromCharCode(i);
      const btn = el("button", { class: "po-btn po-hm-letter", type: "button", "aria-label": `Guess ${ch}` }, [ch]);
      btn.addEventListener("click", () => guess(ch), { signal });
      buttons.set(ch, btn);
      letters.append(btn);
    }

    const persist = () => save(state);

    const setFrameHud = () => {
      ui?.setHUD?.([
        { k: "Mode", v: state.mode === "daily" ? "Daily" : "Endless" },
        { k: "Mistakes", v: `${state.wrong}/${state.maxWrong}` },
        { k: "Left", v: String(Math.max(0, state.maxWrong - state.wrong)) },
      ]);
    };

    const setFrameStatus = () => {
      if (!state.done) {
        ui?.setStatus?.("Choose a letter.");
        return;
      }
      ui?.setStatus?.(state.won ? "Victory — the crew survives." : `Defeat — the word was ${state.word}.`);
    };

    const render = () => {
      hintEl.textContent = state.hint ? `Hint: ${state.hint}` : "Hint: —";
      wordEl.textContent = computeMasked(state.word, state.guessed);

      metaRow.innerHTML = "";
      metaRow.append(
        el("div", { class: "po-chip" }, [el("span", { class: "po-chip__k", text: "Guessed" }), el("span", { class: "po-chip__v", text: String(state.guessed.length) })]),
        el("div", { class: "po-chip" }, [el("span", { class: "po-chip__k", text: "Reveal" }), el("span", { class: "po-chip__v", text: state.revealUsed ? "Used" : "Ready" })]),
      );

      for (const [ch, btn] of buttons.entries()) {
        const used = state.guessed.includes(ch);
        btn.disabled = state.done || used;
        btn.setAttribute("data-used", used ? "1" : "0");
      }

      revealBtn.disabled = state.done || state.revealUsed;

      setFrameHud();
      setFrameStatus();
      persist();
    };

    const endIfNeeded = () => {
      if (state.done) return;

      const won = computeWon(state.word, state.guessed);
      if (won) {
        state.done = true;
        state.won = true;
        return;
      }
      if (state.wrong >= state.maxWrong) {
        state.done = true;
        state.won = false;
      }
    };

    const guess = (ch) => {
      if (state.done) return;
      if (state.guessed.includes(ch)) return;

      state.guessed.push(ch);
      if (!state.word.includes(ch)) state.wrong += 1;

      endIfNeeded();
      render();
    };

    // Keyboard support
    window.addEventListener(
      "keydown",
      (e) => {
        const key = String(e.key || "").toUpperCase();
        if (key.length === 1 && key >= "A" && key <= "Z") guess(key);
      },
      { signal },
    );

    // Control handlers
    modeSelect.addEventListener(
      "change",
      () => {
        state = freshState(entries, modeSelect.value);
        render();
      },
      { signal },
    );

    newBtn.addEventListener(
      "click",
      () => {
        state = freshState(entries, state.mode || "daily");
        render();
      },
      { signal },
    );

    revealBtn.addEventListener(
      "click",
      () => {
        if (state.done || state.revealUsed) return;
        state.revealUsed = true;

        const hidden = state.word.split("").filter((c) => !state.guessed.includes(c));
        if (hidden.length) state.guessed.push(hidden[0]);

        endIfNeeded();
        render();
      },
      { signal },
    );

    clearBtn.addEventListener(
      "click",
      () => {
        clearSave();
        state = freshState(entries, state.mode || "daily");
        render();
      },
      { signal },
    );

    // Ensure daily behaves like daily (same word per day)
    // If they load a stale daily state from a different day, refresh it.
    if ((state.mode || "daily") === "daily" && state.day !== dayKey()) {
      state = freshState(entries, "daily");
    }

    render();
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

    this._entries = null;
    this._root = null;
    this._ctx = null;
  },

  resize() {},
  pause() {},
  resume() {},
};