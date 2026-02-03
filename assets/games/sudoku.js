/* ============================================================================
  Project Odysseus Arcade — Sudoku ("The Nine Seas") [GENERATED v2]
  - Procedural puzzle generator (seeded)
  - Difficulty: Easy/Medium/Hard
  - Uniqueness check (bounded) + MRV solver (fast enough for client)
  - Notes mode + highlight + save/resume
  - Input: click cell then 1-9 / Backspace / N toggle / H hint
  - Lifecycle cleanup: AbortController auto-aborts when root is removed
============================================================================ */

"use strict";

const STORAGE_KEY = "po_arcade_sudoku_v2";

  // --- Helpers --------------------------------------------------------------
  const el = (tag, attrs = {}, children = []) => {
    const node = document.createElement(tag);
    for (const [k, v] of Object.entries(attrs)) {
      if (k === "class") node.className = v;
      else if (k === "text") node.textContent = v;
      else if (k.startsWith("on") && typeof v === "function") node.addEventListener(k.slice(2), v);
      else if (v !== false && v != null) node.setAttribute(k, String(v));
    }
    for (const c of children) node.append(c);
    return node;
  };

  const load = () => { try { return JSON.parse(localStorage.getItem(STORAGE_KEY) || "null"); } catch { return null; } };
  const save = (s) => { try { localStorage.setItem(STORAGE_KEY, JSON.stringify(s)); } catch {} };
  const clearSave = () => { try { localStorage.removeItem(STORAGE_KEY); } catch {} };

  const idx = (r, c) => r * 9 + c;

  function dayKeyUTC() {
    const d = new Date();
    return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}-${String(d.getUTCDate()).padStart(2, "0")}`;
  }

  function hashSeed(str) {
    // FNV-1a
    let h = 2166136261 >>> 0;
    for (let i = 0; i < str.length; i++) { h ^= str.charCodeAt(i); h = Math.imul(h, 16777619); }
    return h >>> 0;
  }

  function seededRng(seed) {
    // Mulberry32-ish
    let a = seed >>> 0;
    return () => {
      a |= 0; a = (a + 0x6D2B79F5) | 0;
      let t = Math.imul(a ^ (a >>> 15), 1 | a);
      t ^= t + Math.imul(t ^ (t >>> 7), 61 | t);
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  // --- Sudoku core ----------------------------------------------------------
  const DIGITS = [1,2,3,4,5,6,7,8,9];

  function conflictsAt(grid, r, c, val) {
    if (!val) return false;

    // row/col
    for (let i = 0; i < 9; i++) {
      if (i !== c && grid[idx(r, i)] === val) return true;
      if (i !== r && grid[idx(i, c)] === val) return true;
    }

    // box
    const br = Math.floor(r / 3) * 3;
    const bc = Math.floor(c / 3) * 3;
    for (let rr = br; rr < br + 3; rr++) {
      for (let cc = bc; cc < bc + 3; cc++) {
        if (rr === r && cc === c) continue;
        if (grid[idx(rr, cc)] === val) return true;
      }
    }
    return false;
  }

  function validGrid(grid) {
    for (let r = 0; r < 9; r++) for (let c = 0; c < 9; c++) {
      const v = grid[idx(r, c)];
      if (v && conflictsAt(grid, r, c, v)) return false;
    }
    return true;
  }

  function candidates(grid, i) {
    if (grid[i]) return [];
    const r = Math.floor(i / 9), c = i % 9;
    const used = new Set();

    for (let k = 0; k < 9; k++) {
      used.add(grid[idx(r, k)] || 0);
      used.add(grid[idx(k, c)] || 0);
    }

    const br = Math.floor(r / 3) * 3;
    const bc = Math.floor(c / 3) * 3;
    for (let rr = br; rr < br + 3; rr++) for (let cc = bc; cc < bc + 3; cc++) {
      used.add(grid[idx(rr, cc)] || 0);
    }

    return DIGITS.filter(d => !used.has(d));
  }

  function shuffle(arr, rng) {
    const a = arr.slice();
    for (let i = a.length - 1; i > 0; i--) {
      const j = Math.floor(rng() * (i + 1));
      [a[i], a[j]] = [a[j], a[i]];
    }
    return a;
  }

  function solveOne(grid, rng, limitNodes = 120_000) {
    // Backtracking solver with MRV heuristic. Returns solved grid or null.
    let nodes = 0;
    const g = grid.slice();

    function pickCell() {
      let bestI = -1;
      let bestCands = null;

      for (let i = 0; i < 81; i++) {
        if (g[i]) continue;
        const c = candidates(g, i);
        if (c.length === 0) return { i: -1, cands: [] };
        if (!bestCands || c.length < bestCands.length) {
          bestCands = c;
          bestI = i;
          if (c.length === 1) break;
        }
      }

      return { i: bestI, cands: bestCands || [] };
    }

    function dfs() {
      if (++nodes > limitNodes) return false;

      const { i, cands } = pickCell();
      if (i === -1) {
        for (let k = 0; k < 81; k++) if (!g[k]) return false;
        return true;
      }

      const order = rng ? shuffle(cands, rng) : cands;
      for (const v of order) {
        g[i] = v;
        if (dfs()) return true;
        g[i] = 0;
      }
      return false;
    }

    if (!validGrid(g)) return null;
    return dfs() ? g.slice() : null;
  }

  function countSolutions(grid, maxCount = 2, limitNodes = 140_000) {
    // Counts solutions up to maxCount (early exits), using MRV.
    let count = 0;
    let nodes = 0;
    const g = grid.slice();

    function pickCell() {
      let bestI = -1;
      let bestCands = null;

      for (let i = 0; i < 81; i++) {
        if (g[i]) continue;
        const c = candidates(g, i);
        if (c.length === 0) return { i: -1, cands: [] };
        if (!bestCands || c.length < bestCands.length) {
          bestCands = c;
          bestI = i;
          if (c.length === 1) break;
        }
      }
      return { i: bestI, cands: bestCands || [] };
    }

    function dfs() {
      if (++nodes > limitNodes) return;
      const { i, cands } = pickCell();

      if (i === -1) {
        for (let k = 0; k < 81; k++) if (!g[k]) return;
        count++;
        return;
      }

      for (const v of cands) {
        g[i] = v;
        dfs();
        if (count >= maxCount) return;
        g[i] = 0;
      }
    }

    if (!validGrid(g)) return 0;
    dfs();
    return count;
  }

  function generateSolved(seed) {
    const rng = seededRng(seed);
    const empty = Array(81).fill(0);
    return solveOne(empty, rng, 140_000);
  }

  function difficultySpec(level) {
    // tuned for mobile performance: fewer uniqueness nodes on easy, more on hard
    if (level === "Easy") return { targetClues: 40, uniquenessNodes: 85_000, removeTries: 120 };
    if (level === "Hard") return { targetClues: 28, uniquenessNodes: 165_000, removeTries: 190 };
    return { targetClues: 34, uniquenessNodes: 125_000, removeTries: 155 }; // Medium
  }

  function generatePuzzle({ seed, level }) {
    const spec = difficultySpec(level);
    const rng = seededRng(seed ^ 0xA5A5A5A5);

    const solved = generateSolved(seed);
    if (!solved) return null;

    let puzzle = solved.slice();
    let clues = 81;

    const order = shuffle(Array.from({ length: 81 }, (_, i) => i), rng);

    let tries = 0;
    for (const i of order) {
      if (tries++ > spec.removeTries) break;
      if (clues <= spec.targetClues) break;
      if (!puzzle[i]) continue;

      const keep = puzzle[i];
      puzzle[i] = 0;

      const sols = countSolutions(puzzle, 2, spec.uniquenessNodes);
      if (sols !== 1) puzzle[i] = keep;
      else clues--;
    }

    return { puzzle, solved, clues };
  }

  function isSolved(grid, givens) {
    for (let i = 0; i < 81; i++) {
      const v = grid[i];
      if (v < 1 || v > 9) return false;
    }
    for (let r = 0; r < 9; r++) for (let c = 0; c < 9; c++) {
      const v = grid[idx(r, c)];
      if (conflictsAt(grid, r, c, v)) return false;
    }
    for (let i = 0; i < 81; i++) if (givens[i] && grid[i] !== givens[i]) return false;
    return true;
  }

  // --- UI mount -------------------------------------------------------------
  function mount(root, ctx) {
    root.innerHTML = "";
    const ui = ctx.ui;

    const head = el("div", { class: "po-arcade-head" }, [
      el("div", { class: "po-arcade-title", text: "Sudoku" }),
      el("div", { class: "po-arcade-subtitle", text: "The Nine Seas — generated charts." }),
    ]);

    const restored = load();

    let level = restored?.level || "Medium";
    let mode = restored?.mode || "daily"; // daily | endless

    const status = el("div", { class: "po-arcade-status", text: "Generating chart…" });
    const setFrameStatus = (t) => ui?.setStatus?.(t);
    const setHud = () => {
      ui?.setHUD?.([
        { k: "Mode", v: mode === "daily" ? "Daily" : "Endless" },
        { k: "Level", v: level },
        { k: "Hints", v: String(state?.hintsUsed ?? 0) },
      ]);
    };
    const setStatus = (t) => {
      status.textContent = t;
      setFrameStatus(t);
    };

    const levelSelect = el("select", {
      class: "po-arcade-select",
      "aria-label": "Select difficulty",
    }, [
      el("option", { value: "Easy", text: "Easy" }),
      el("option", { value: "Medium", text: "Medium" }),
      el("option", { value: "Hard", text: "Hard" }),
    ]);
    levelSelect.value = level;

    const modeSelect = el("select", {
      class: "po-arcade-select",
      "aria-label": "Select mode",
    }, [
      el("option", { value: "daily", text: "Daily Chart" }),
      el("option", { value: "endless", text: "Endless" }),
    ]);
    modeSelect.value = mode;

    const notesBtn = el("button", { class: "po-arcade-btn", type: "button" }, ["Notes (N)"]);
    const hintBtn  = el("button", { class: "po-arcade-btn", type: "button" }, ["Hint (H)"]);
    const resetBtn = el("button", { class: "po-arcade-btn", type: "button" }, ["Reset"]);
    const newBtn   = el("button", { class: "po-arcade-btn", type: "button" }, ["New"]);
    const clearBtn = el("button", { class: "po-arcade-btn po-arcade-btn-ghost", type: "button" }, ["Clear Save"]);

    const controls = el("div", { class: "po-arcade-controls" }, [
      el("div", { class: "po-arcade-control" }, [
        el("span", { class: "po-arcade-label", text: "Mode" }),
        modeSelect,
      ]),
      el("div", { class: "po-arcade-control" }, [
        el("span", { class: "po-arcade-label", text: "Level" }),
        levelSelect,
      ]),
      notesBtn, hintBtn, resetBtn, newBtn, clearBtn,
    ]);

    const board = el("div", { class: "po-sd-board", role: "grid", "aria-label": "Sudoku board" });

    const pad = el("div", { class: "po-sd-pad", role: "group", "aria-label": "Number pad" });
    for (let n = 1; n <= 9; n++) {
      pad.appendChild(el("button", { class: "po-sd-pad-btn", type: "button", "aria-label": `Enter ${n}` }, [String(n)]));
    }
    pad.appendChild(el("button", { class: "po-sd-pad-btn po-sd-pad-btn-ghost", type: "button", "aria-label": "Clear cell" }, ["⌫"]));

    root.append(head, controls, status, board, pad);

    // Build 81 cells
    const cells = [];
    for (let r = 0; r < 9; r++) for (let c = 0; c < 9; c++) {
      const cell = el("button", {
        class: "po-sd-cell",
        type: "button",
        role: "gridcell",
        "aria-label": `Row ${r + 1} Column ${c + 1}`,
      });
      cells.push(cell);
      board.appendChild(cell);
    }

    // Runtime state
    let state = null;
    let notesSets = null;
    let solution = null;

    function persist() {
      if (!state) return;
      state.notes = notesSets.map(set => [...set].sort((a,b)=>a-b));
      save(state);
    }

    function seedFor({ mode, level }) {
      const base = `po-sd-${mode}-${level}-`;
      if (mode === "daily") return hashSeed(base + dayKeyUTC());
      return hashSeed(base + String(Date.now()) + "-" + String(Math.random()));
    }

    function startNew({ keepMode = false, keepLevel = false } = {}) {
      if (!keepMode) modeSelect.value = mode;
      if (!keepLevel) levelSelect.value = level;

      setStatus("Generating chart…");

      const seed = seedFor({ mode, level });
      const dailyKey = mode === "daily" ? dayKeyUTC() : null;

      const gen = generatePuzzle({ seed, level });
      if (!gen) { setStatus("Generation failed. Tap New again."); return; }

      solution = gen.solved.slice();
      const givens = gen.puzzle.slice();

      state = {
        v: 2,
        mode,
        level,
        dailyKey,
        seed,
        givens,
        grid: gen.puzzle.slice(),
        selected: 0,
        notesMode: false,
        hintsUsed: 0,
        startedAt: Date.now(),
        notes: Array.from({ length: 81 }, () => []),
      };
      notesSets = Array.from({ length: 81 }, () => new Set());

      persist();
      render();
      setStatus(`Chart ready — ${mode === "daily" ? "Daily" : "Endless"} • ${level} • ${gen.clues} clues`);
    }

    function restoreOrNew() {
      const r = restored;
      const today = dayKeyUTC();

      if (
        r && r.v === 2 &&
        Array.isArray(r.grid) && r.grid.length === 81 &&
        Array.isArray(r.givens) && r.givens.length === 81
      ) {
        if (r.mode === "daily" && r.dailyKey !== today) {
          mode = "daily";
          level = r.level || "Medium";
          modeSelect.value = mode;
          levelSelect.value = level;
          startNew({ keepMode: true, keepLevel: true });
          return;
        }

        const gen = generatePuzzle({ seed: r.seed, level: r.level || "Medium" });
        if (!gen) { startNew(); return; }

        state = r;
        mode = r.mode || mode;
        level = r.level || level;
        modeSelect.value = mode;
        levelSelect.value = level;

        solution = gen.solved.slice();
        notesSets = (r.notes || Array.from({ length: 81 }, () => [])).map(arr => new Set(arr || []));

        setStatus(`Resumed — ${mode === "daily" ? "Daily" : "Endless"} • ${level}`);
        render();
        return;
      }

      startNew({ keepMode: true, keepLevel: true });
    }

    function applyNumber(n) {
      if (!state) return;
      const i = state.selected;

      if (state.givens[i]) return;

      if (state.notesMode && n !== 0) {
        if (notesSets[i].has(n)) notesSets[i].delete(n);
        else notesSets[i].add(n);
      } else {
        state.grid[i] = n;
        notesSets[i].clear();
      }

      persist();
      render();

      if (isSolved(state.grid, state.givens)) {
        setStatus(`Perfect chart — mastered. Hints used: ${state.hintsUsed}.`);
      }
    }

    function doHint() {
      if (!state) return;
      const empties = [];
      for (let i = 0; i < 81; i++) if (!state.grid[i]) empties.push(i);
      if (!empties.length) return;

      // Choose a cell with fewest candidates for a “fair” hint
      let best = empties[0];
      let bestLen = 10;
      for (const i of empties) {
        const c = candidates(state.grid, i);
        if (c.length && c.length < bestLen) { bestLen = c.length; best = i; }
      }

      state.grid[best] = solution[best];
      notesSets[best].clear();
      state.hintsUsed += 1;
      state.selected = best;

      persist();
      render();
      setStatus(`Hint placed. Total hints: ${state.hintsUsed}.`);
    }

    function render() {
      if (!state) return;

      const selectedVal = state.grid[state.selected];

      for (let i = 0; i < 81; i++) {
        const r = Math.floor(i / 9), c = i % 9;
        const v = state.grid[i];
        const given = state.givens[i] !== 0;

        const cell = cells[i];
        cell.className = "po-sd-cell";

        // 3x3 border hooks
        if (c % 3 === 0) cell.classList.add("bL");
        if (r % 3 === 0) cell.classList.add("bT");
        if (c === 8) cell.classList.add("bR");
        if (r === 8) cell.classList.add("bB");

        if (i === state.selected) cell.classList.add("is-selected");
        if (selectedVal && v === selectedVal) cell.classList.add("is-same");
        if (given) cell.classList.add("is-given");
        if (v && conflictsAt(state.grid, r, c, v)) cell.classList.add("is-conflict");

        if (v) {
          cell.textContent = String(v);
        } else {
          const notes = [...notesSets[i]].sort((a,b)=>a-b);
          cell.textContent = notes.length ? notes.join("") : "";
          cell.classList.toggle("is-notes", notes.length > 0);
        }

        cell.disabled = false;
      }

      notesBtn.classList.toggle("is-active", !!state.notesMode);
      setHud();
    }

    // --- Wire UI -------------------------------------------------------------

    ctx.addEvent(modeSelect, "change", () => {
      mode = modeSelect.value;
      startNew({ keepMode: true, keepLevel: true });
    });

    ctx.addEvent(levelSelect, "change", () => {
      level = levelSelect.value;
      startNew({ keepMode: true, keepLevel: true });
    });

    cells.forEach((cell, i) => {
      ctx.addEvent(cell, "click", () => {
        if (!state) return;
        state.selected = i;
        persist();
        render();
      });
    });

    Array.from(pad.querySelectorAll("button")).forEach((btn) => {
      const t = btn.textContent;
      if (t === "⌫") ctx.addEvent(btn, "click", () => applyNumber(0));
      else ctx.addEvent(btn, "click", () => applyNumber(Number(t)));
    });

    ctx.addEvent(notesBtn, "click", () => {
      if (!state) return;
      state.notesMode = !state.notesMode;
      persist();
      render();
      setStatus(state.notesMode ? "Notes mode: ON" : "Notes mode: OFF");
    });

    ctx.addEvent(hintBtn, "click", () => doHint());

    ctx.addEvent(resetBtn, "click", () => {
      if (!state) return;
      state.grid = state.givens.slice();
      notesSets = Array.from({ length: 81 }, () => new Set());
      state.hintsUsed = 0;
      persist();
      render();
      setStatus("Reset to chart start.");
    });

    ctx.addEvent(newBtn, "click", () => startNew({ keepMode: true, keepLevel: true }));

    ctx.addEvent(clearBtn, "click", () => {
      clearSave();
      setStatus("Save cleared.");
      startNew({ keepMode: true, keepLevel: true });
    });

    ctx.addEvent(window, "keydown", (e) => {
      if (!state) return;
      const k = e.key;

      if (k === "n" || k === "N") { state.notesMode = !state.notesMode; persist(); render(); setStatus(state.notesMode ? "Notes mode: ON" : "Notes mode: OFF"); return; }
      if (k === "h" || k === "H") { doHint(); return; }
      if (k >= "1" && k <= "9") { applyNumber(Number(k)); return; }
      if (k === "Backspace" || k === "Delete") { applyNumber(0); return; }

      const s = state.selected;
      const r = Math.floor(s / 9), c = s % 9;

      if (k === "ArrowUp") state.selected = idx((r + 8) % 9, c);
      if (k === "ArrowDown") state.selected = idx((r + 1) % 9, c);
      if (k === "ArrowLeft") state.selected = idx(r, (c + 8) % 9);
      if (k === "ArrowRight") state.selected = idx(r, (c + 1) % 9);

      if (k.startsWith("Arrow")) { persist(); render(); }
    });

    restoreOrNew();
  }

export default {
  init(ctx) {
    return mount(ctx.root, ctx);
  },
};