import { el, clear } from "../lib/ui.js";

const MODES = {
  easy: { rows: 9, cols: 9, mines: 10 },
  normal: { rows: 12, cols: 12, mines: 24 },
  hard: { rows: 16, cols: 16, mines: 40 },
};

const BEST_KEY = "po_arcade_minesweeper_best";

function readBest() {
  try { return JSON.parse(localStorage.getItem(BEST_KEY) || "null"); } catch { return null; }
}

function writeBest(best) {
  try { localStorage.setItem(BEST_KEY, JSON.stringify(best)); } catch {}
}

function makeGrid(rows, cols) {
  return Array.from({ length: rows }, () => Array.from({ length: cols }, () => ({
    mine: false,
    revealed: false,
    flagged: false,
    count: 0,
  })));
}

function neighbors(r, c, rows, cols) {
  const cells = [];
  for (let dr = -1; dr <= 1; dr++) {
    for (let dc = -1; dc <= 1; dc++) {
      if (!dr && !dc) continue;
      const rr = r + dr;
      const cc = c + dc;
      if (rr >= 0 && rr < rows && cc >= 0 && cc < cols) cells.push([rr, cc]);
    }
  }
  return cells;
}

function plantMines(grid, mines, safeR, safeC) {
  const rows = grid.length;
  const cols = grid[0].length;
  let placed = 0;
  while (placed < mines) {
    const r = Math.floor(Math.random() * rows);
    const c = Math.floor(Math.random() * cols);
    if ((r === safeR && c === safeC) || grid[r][c].mine) continue;
    grid[r][c].mine = true;
    placed++;
  }

  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      const cell = grid[r][c];
      if (cell.mine) continue;
      cell.count = neighbors(r, c, rows, cols).filter(([rr, cc]) => grid[rr][cc].mine).length;
    }
  }
}

export default {
  _ac: null,
  _root: null,
  _ctx: null,
  _state: null,

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

    const state = { paused: false };
    this._state = state;

    let mode = "easy";
    let grid = null;
    let revealedCount = 0;
    let flaggedCount = 0;
    let minesTotal = MODES[mode].mines;
    let startedAt = null;
    let timerId = null;
    let elapsed = 0;
    let flagMode = false;
    let resultRecorded = false;

    const wrap = el("div", { class: "po-ms-wrap" });
    const gridEl = el("div", { class: "po-ms-grid", role: "grid", "aria-label": "Minesweeper grid" });
    wrap.append(gridEl);
    root.append(wrap);

    const modeSelect = el("select", { class: "po-select", "aria-label": "Select difficulty" }, [
      el("option", { value: "easy", text: "Easy" }),
      el("option", { value: "normal", text: "Normal" }),
      el("option", { value: "hard", text: "Hard" }),
    ]);

    const flagBtn = el("button", { class: "po-btn", type: "button" }, ["Flag: Off"]);
    const newBtn = el("button", { class: "po-btn po-btn--primary", type: "button" }, ["New"]);

    const controlsRow = el("div", { class: "po-pillrow" }, [modeSelect, flagBtn, newBtn]);
    ui?.setControls?.(controlsRow);

    const setHud = () => {
      ui?.setHUD?.([
        { k: "Mines", v: String(minesTotal - flaggedCount) },
        { k: "Time", v: String(elapsed) },
      ]);
    };

    const setStatus = (msg) => ui?.setStatus?.(msg);

    function reset(nextMode = mode) {
      mode = nextMode;
      const cfg = MODES[mode];
      grid = makeGrid(cfg.rows, cfg.cols);
      revealedCount = 0;
      flaggedCount = 0;
      minesTotal = cfg.mines;
      startedAt = null;
      elapsed = 0;
      resultRecorded = false;
      flagMode = false;
      flagBtn.textContent = "Flag: Off";
      modeSelect.value = mode;
      render();
      setStatus("Scan the field.");
      setHud();
    }

    function ensureTimer() {
      if (timerId) return;
      startedAt = Date.now();
      timerId = ctx.interval(() => {
        elapsed = Math.floor((Date.now() - startedAt) / 1000);
        setHud();
      }, 1000);
    }

    function recordResult(won) {
      if (resultRecorded || !storage?.get || !storage?.update) return;
      const stats = storage.get();
      storage.update({
        wins: stats.wins + (won ? 1 : 0),
        losses: stats.losses + (won ? 0 : 1),
      });
      resultRecorded = true;
    }

    function reveal(r, c) {
      const cell = grid[r][c];
      if (cell.revealed || cell.flagged) return;
      if (!startedAt) {
        plantMines(grid, minesTotal, r, c);
        ensureTimer();
      }
      cell.revealed = true;
      revealedCount++;
      if (cell.mine) {
        setStatus("Mine hit. Game over.");
        recordResult(false);
        revealAll();
        return;
      }
      if (cell.count === 0) {
        for (const [rr, cc] of neighbors(r, c, grid.length, grid[0].length)) {
          reveal(rr, cc);
        }
      }
      checkWin();
    }

    function toggleFlag(r, c) {
      const cell = grid[r][c];
      if (cell.revealed) return;
      cell.flagged = !cell.flagged;
      flaggedCount += cell.flagged ? 1 : -1;
    }

    function revealAll() {
      for (const row of grid) {
        for (const cell of row) cell.revealed = true;
      }
      render();
    }

    function checkWin() {
      const total = grid.length * grid[0].length;
      if (revealedCount >= total - minesTotal) {
        setStatus("Field cleared. Victory.");
        recordResult(true);
        const best = readBest() || {};
        const bestTime = best[mode];
        if (!bestTime || elapsed < bestTime) {
          best[mode] = elapsed;
          writeBest(best);
        }
      }
      render();
    }

    function render() {
      gridEl.innerHTML = "";
      gridEl.style.gridTemplateColumns = `repeat(${grid[0].length}, minmax(0, 1fr))`;

      for (let r = 0; r < grid.length; r++) {
        for (let c = 0; c < grid[0].length; c++) {
          const cell = grid[r][c];
          let label = "";
          if (cell.revealed) {
            label = cell.mine ? "*" : (cell.count ? String(cell.count) : "");
          } else if (cell.flagged) {
            label = "F";
          }

          const btn = el("button", {
            class: "po-ms-cell",
            type: "button",
            role: "gridcell",
            "data-revealed": cell.revealed ? "1" : "0",
            "data-mine": cell.mine ? "1" : "0",
            "data-count": String(cell.count || 0),
          }, [label]);

          ctx.addEvent(btn, "click", () => {
            if (state.paused) return;
            if (flagMode) toggleFlag(r, c);
            else reveal(r, c);
            render();
            setHud();
          }, { signal });

          gridEl.append(btn);
        }
      }
    }

    ctx.addEvent(flagBtn, "click", () => {
      flagMode = !flagMode;
      flagBtn.textContent = flagMode ? "Flag: On" : "Flag: Off";
    }, { signal });

    ctx.addEvent(newBtn, "click", () => reset(modeSelect.value), { signal });
    ctx.addEvent(modeSelect, "change", () => reset(modeSelect.value), { signal });

    reset();
  },

  destroy() {
    try { this._ac?.abort?.(); } catch {}
    this._ac = null;
    try { this._ctx?.ui?.setControls?.(null); } catch {}
    try { this._ctx?.ui?.setStatus?.(""); } catch {}
    try { this._ctx?.ui?.setHUD?.([]); } catch {}
    this._root = null;
    this._ctx = null;
    this._state = null;
  },

  pause() {
    if (this._state) this._state.paused = true;
  },
  resume() {
    if (this._state) this._state.paused = false;
  },
  resize() {},
};
