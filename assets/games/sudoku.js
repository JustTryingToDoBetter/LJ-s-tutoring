/* ============================================================================
  Project Odysseus Arcade — Sudoku ("The Nine Seas")
  - Puzzle pack for performance + predictable difficulty
  - Notes mode + highlight + save/resume
  - Input: click cell then 1-9 / Backspace / N for Notes toggle
============================================================================ */

(() => {
  "use strict";

  const GAME_ID = "sudoku";
  const STORAGE_KEY = "po_arcade_sudoku_v1";

  // --- Puzzle pack ----------------------------------------------------------
  // Format: strings of 81 chars, "0" = empty.
  // (These are standard Sudoku puzzles; edit/expand any time.)
  const PUZZLES = [
    // Easy
    { id: "E1", level: "Easy", grid: "530070000600195000098000060800060003400803001700020006060000280000419005000080079" },
    { id: "E2", level: "Easy", grid: "200080300060070084030500209000105408000000000402706000301007040720040060004010003" },

    // Medium
    { id: "M1", level: "Medium", grid: "000260701680070090190004500820100040004602900050003028009300074040050036703018000" },
    { id: "M2", level: "Medium", grid: "300000000005009000200504000020000700160000058704310600000890100000067080000005437" },

    // Hard
    { id: "H1", level: "Hard", grid: "000000907000420180000705026100904000050000040000507009920108000034059000507000000" },
    { id: "H2", level: "Hard", grid: "000900802128006000070000000050700000000000000000004010000000090000500637306009000" },
  ];

  // Deterministic-ish daily selection without backend:
  // Same puzzle for everyone each day, based on UTC date.
  const dailyIndex = () => {
    const d = new Date();
    const key = `${d.getUTCFullYear()}-${d.getUTCMonth()+1}-${d.getUTCDate()}`;
    // simple hash
    let h = 0;
    for (let i = 0; i < key.length; i++) h = (h * 31 + key.charCodeAt(i)) >>> 0;
    return h % PUZZLES.length;
  };

  // --- Helpers --------------------------------------------------------------
  const el = (tag, attrs = {}, children = []) => {
    const node = document.createElement(tag);
    for (const [k, v] of Object.entries(attrs)) {
      if (k === "class") node.className = v;
      else if (k === "text") node.textContent = v;
      else if (k.startsWith("on") && typeof v === "function") node.addEventListener(k.slice(2), v);
      else node.setAttribute(k, String(v));
    }
    for (const c of children) node.append(c);
    return node;
  };

  const load = () => {
    try { return JSON.parse(localStorage.getItem(STORAGE_KEY) || "null"); } catch { return null; }
  };
  const save = (s) => { try { localStorage.setItem(STORAGE_KEY, JSON.stringify(s)); } catch {} };
  const clearSave = () => { try { localStorage.removeItem(STORAGE_KEY); } catch {} };

  const idx = (r, c) => r * 9 + c;

  const parseGrid = (str) => str.split("").map((ch) => Number(ch));
  const cloneNotes = (notes) => notes.map(set => new Set([...set]));

  // Sudoku validity check (used for conflict highlighting)
  const conflictsAt = (grid, r, c, val) => {
    if (!val) return false;
    // row / col
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
  };

  const isSolved = (grid, givens) => {
    for (let i = 0; i < 81; i++) {
      if (grid[i] < 1 || grid[i] > 9) return false;
    }
    // validate all filled cells
    for (let r = 0; r < 9; r++) {
      for (let c = 0; c < 9; c++) {
        const v = grid[idx(r, c)];
        if (conflictsAt(grid, r, c, v)) 
          cell.classList.add("po-failure")
          return false;
      }
    }
    // givens should not be changed
    for (let i = 0; i < 81; i++) if (givens[i] && grid[i] !== givens[i]) return false;
    return true;
  };

  // --- UI mount -------------------------------------------------------------
  function mount(root) {
    root.innerHTML = "";

    const head = el("div", { class: "po-arcade-head" }, [
      el("div", { class: "po-arcade-title", text: "Sudoku" }),
      el("div", { class: "po-arcade-subtitle", text: "Chart the Nine Seas — one cell at a time." }),
    ]);

    // Restore or start daily
    const restored = load();
    const chosen = PUZZLES[dailyIndex()];
    const base = parseGrid(chosen.grid);

    let state = restored && restored.grid && restored.givens
      ? restored
      : {
          puzzleId: chosen.id,
          level: chosen.level,
          givens: base.slice(),            // fixed numbers
          grid: base.slice(),              // player numbers
          notes: Array.from({ length: 81 }, () => []), // stored as arrays for JSON
          selected: 0,
          notesMode: false,
          message: `Daily chart: ${chosen.level} (${chosen.id})`,
        };

    // Convert note arrays back into Sets for runtime
    let notesSets = state.notes.map(arr => new Set(arr));

    const status = el("div", { class: "po-arcade-status", text: state.message });

    const notesBtn = el("button", {
      class: "po-arcade-btn",
      type: "button",
      onclick: () => {
        state.notesMode = !state.notesMode;
        status.textContent = state.notesMode ? "Notes mode: ON" : "Notes mode: OFF";
        persist();
        render();
      },
    }, [document.createTextNode("Notes (N)")]);

    const resetBtn = el("button", {
      class: "po-arcade-btn",
      type: "button",
      onclick: () => {
        state.grid = state.givens.slice();
        notesSets = Array.from({ length: 81 }, () => new Set());
        status.textContent = "Reset to the start of this chart.";
        persist();
        render();
      },
    }, [document.createTextNode("Reset Puzzle")]);

    const newBtn = el("button", {
      class: "po-arcade-btn po-arcade-btn-ghost",
      type: "button",
      onclick: () => {
        // Switch to the next puzzle in the pack locally (no backend).
        const currentIndex = PUZZLES.findIndex(p => p.id === state.puzzleId);
        const next = PUZZLES[(currentIndex + 1 + PUZZLES.length) % PUZZLES.length];
        const nextBase = parseGrid(next.grid);

        state = {
          puzzleId: next.id,
          level: next.level,
          givens: nextBase.slice(),
          grid: nextBase.slice(),
          notes: Array.from({ length: 81 }, () => []),
          selected: 0,
          notesMode: false,
          message: `New chart: ${next.level} (${next.id})`,
        };
        notesSets = state.notes.map(arr => new Set(arr));
        status.textContent = state.message;
        persist();
        render();
      },
    }, [document.createTextNode("Next Chart")]);

    const clearBtn = el("button", {
      class: "po-arcade-btn po-arcade-btn-ghost",
      type: "button",
      onclick: () => { clearSave(); status.textContent = "Save cleared."; },
    }, [document.createTextNode("Clear Save")]);

    const controls = el("div", { class: "po-arcade-controls" }, [
      notesBtn, resetBtn, newBtn, clearBtn,
    ]);

    // Grid container
    const board = el("div", { class: "po-sd-board", role: "grid", "aria-label": "Sudoku board" });

    // Number pad
    const pad = el("div", { class: "po-sd-pad", role: "group", "aria-label": "Number pad" });
    for (let n = 1; n <= 9; n++) {
      pad.appendChild(el("button", {
        class: "po-sd-pad-btn",
        type: "button",
        "aria-label": `Enter ${n}`,
        onclick: () => applyNumber(n),
      }, [document.createTextNode(String(n))]));
    }
    pad.appendChild(el("button", {
      class: "po-sd-pad-btn po-sd-pad-btn-ghost",
      type: "button",
      "aria-label": "Clear cell",
      onclick: () => applyNumber(0),
    }, [document.createTextNode("⌫")]));

    root.append(head, controls, status, board, pad);

    // Build 81 cells
    const cells = [];
    for (let r = 0; r < 9; r++) {
      for (let c = 0; c < 9; c++) {
        const cell = el("button", {
          class: "po-sd-cell",
          type: "button",
          role: "gridcell",
          "aria-label": `Row ${r + 1} Column ${c + 1}`,
          onclick: () => {
            state.selected = idx(r, c);
            persist();
            render();
          },
        });
        cells.push(cell);
        board.appendChild(cell);
      }
    }

    // Keyboard controls
    const onKeyDown = (e) => {
      const k = e.key;
      if (k === "n" || k === "N") {
        state.notesMode = !state.notesMode;
        status.textContent = state.notesMode ? "Notes mode: ON" : "Notes mode: OFF";
        persist(); render(); return;
      }
      if (k >= "1" && k <= "9") { applyNumber(Number(k)); return; }
      if (k === "Backspace" || k === "Delete") { applyNumber(0); return; }

      // Arrow navigation
      const s = state.selected;
      const r = Math.floor(s / 9), c = s % 9;
      if (k === "ArrowUp") state.selected = idx((r + 8) % 9, c);
      if (k === "ArrowDown") state.selected = idx((r + 1) % 9, c);
      if (k === "ArrowLeft") state.selected = idx(r, (c + 8) % 9);
      if (k === "ArrowRight") state.selected = idx(r, (c + 1) % 9);
      if (k.startsWith("Arrow")) { persist(); render(); }
    };
    window.addEventListener("keydown", onKeyDown);

    function persist() {
      // Convert Sets -> arrays for storage
      state.notes = notesSets.map(set => [...set].sort());
      save(state);
    }

    function applyNumber(n) {
      const i = state.selected;

      // Block editing given cells
      if (state.givens[i]) return;

      if (state.notesMode && n !== 0) {
        // Toggle note
        if (notesSets[i].has(n)) notesSets[i].delete(n);
        else notesSets[i].add(n);
      } else {
        // Set value
        state.grid[i] = n;
        notesSets[i].clear();
      }

      persist();
      render();

      // Completion message
      if (isSolved(state.grid, state.givens)) {
        status.textContent = "Perfect chart — you’ve mastered the Nine Seas.";
      }
    }

    function render() {
      const selectedVal = state.grid[state.selected];
      for (let i = 0; i < 81; i++) {
        const r = Math.floor(i / 9), c = i % 9;
        const v = state.grid[i];
        const given = state.givens[i] !== 0;

        const cell = cells[i];
        cell.className = "po-sd-cell";

        // Thick borders for 3x3 boxes (styling hook)
        if (c % 3 === 0) cell.classList.add("bL");
        if (r % 3 === 0) cell.classList.add("bT");
        if (c === 8) cell.classList.add("bR");
        if (r === 8) cell.classList.add("bB");

        if (i === state.selected) cell.classList.add("is-selected");
        if (selectedVal && v === selectedVal) cell.classList.add("is-same");

        if (given) cell.classList.add("is-given");

        // Conflict highlight (only for filled cells)
        if (v && conflictsAt(state.grid, r, c, v)) cell.classList.add("is-conflict");

        // Render value or notes
        if (v) {
          cell.textContent = String(v);
          cell.setAttribute("aria-label", `Row ${r + 1} Column ${c + 1} value ${v}`);
        } else {
          const notes = [...notesSets[i]].sort((a,b) => a - b);
          cell.textContent = notes.length ? notes.join("") : "";
          cell.classList.toggle("is-notes", notes.length > 0);
          cell.setAttribute("aria-label", `Row ${r + 1} Column ${c + 1} empty`);
        }

        cell.disabled = false;
      }

      // Update notes button visual state
      notesBtn.classList.toggle("is-active", state.notesMode);
    }

    render();
  }

  // --- Register game --------------------------------------------------------
  window.PO_ARCADE_GAMES = window.PO_ARCADE_GAMES || [];
  window.PO_ARCADE_GAMES.push({
    id: GAME_ID,
    title: "Sudoku",
    subtitle: "The Nine Seas.",
    icon: "🧩",
    mount,
  });
})();
