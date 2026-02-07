import { el, clear } from "../lib/ui.js";

const SIZE = 4;

function emptyBoard() {
  return Array.from({ length: SIZE }, () => Array(SIZE).fill(0));
}

function cloneBoard(b) {
  return b.map((row) => row.slice());
}

function randEmpty(board) {
  const cells = [];
  for (let r = 0; r < SIZE; r++) {
    for (let c = 0; c < SIZE; c++) {
      if (board[r][c] === 0) cells.push([r, c]);
    }
  }
  if (!cells.length) return null;
  return cells[Math.floor(Math.random() * cells.length)];
}

function addTile(board) {
  const spot = randEmpty(board);
  if (!spot) return false;
  const [r, c] = spot;
  board[r][c] = Math.random() < 0.9 ? 2 : 4;
  return true;
}

function compress(line) {
  const filtered = line.filter((v) => v !== 0);
  while (filtered.length < SIZE) filtered.push(0);
  return filtered;
}

function merge(line) {
  let score = 0;
  for (let i = 0; i < SIZE - 1; i++) {
    if (line[i] && line[i] === line[i + 1]) {
      line[i] *= 2;
      line[i + 1] = 0;
      score += line[i];
    }
  }
  return score;
}

function boardsEqual(a, b) {
  for (let r = 0; r < SIZE; r++) {
    for (let c = 0; c < SIZE; c++) {
      if (a[r][c] !== b[r][c]) return false;
    }
  }
  return true;
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

    let board = emptyBoard();
    let score = 0;
    let best = storage?.get?.().bestScore || 0;

    addTile(board);
    addTile(board);

    const wrap = el("div", { class: "po-2048-wrap" });
    const grid = el("div", { class: "po-2048-grid", role: "grid", "aria-label": "2048 grid" });
    wrap.append(grid);
    root.append(wrap);

    const controlsRow = el("div", { class: "po-pillrow" }, [
      el("button", { class: "po-btn po-btn--primary", type: "button", onClick: () => reset() }, ["New"]),
    ]);
    ui?.setControls?.(controlsRow);

    const setHud = () => {
      ui?.setHUD?.([
        { k: "Score", v: String(score) },
        { k: "Best", v: String(best) },
      ]);
    };

    const setStatus = (msg) => ui?.setStatus?.(msg);

    const render = () => {
      grid.innerHTML = "";
      for (let r = 0; r < SIZE; r++) {
        for (let c = 0; c < SIZE; c++) {
          const value = board[r][c];
          const cell = el("div", {
            class: "po-2048-cell",
            role: "gridcell",
            "data-value": value ? String(value) : "0",
          }, [value ? String(value) : ""]);
          grid.append(cell);
        }
      }
      setHud();
    };

    const move = (dir) => {
      if (state.paused) return false;
      const next = emptyBoard();
      let gained = 0;

      const forward = dir === "left" || dir === "up";
      const rowMajor = dir === "left" || dir === "right";

      for (let i = 0; i < SIZE; i++) {
        const line = [];
        for (let j = 0; j < SIZE; j++) {
          const r = rowMajor ? i : (forward ? j : SIZE - 1 - j);
          const c = rowMajor ? (forward ? j : SIZE - 1 - j) : i;
          line.push(board[r][c]);
        }

        const compact = compress(line);
        gained += merge(compact);
        const merged = compress(compact);

        for (let j = 0; j < SIZE; j++) {
          const r = rowMajor ? i : (forward ? j : SIZE - 1 - j);
          const c = rowMajor ? (forward ? j : SIZE - 1 - j) : i;
          next[r][c] = merged[j];
        }
      }

      if (boardsEqual(board, next)) return false;
      board = next;
      score += gained;
      if (score > best) best = score;
      storage?.recordScore?.(score);
      addTile(board);
      render();
      if (!hasMoves()) setStatus("No moves left. New run?");
      return true;
    };

    const hasMoves = () => {
      const b = board;
      for (let r = 0; r < SIZE; r++) {
        for (let c = 0; c < SIZE; c++) {
          if (b[r][c] === 0) return true;
          if (c < SIZE - 1 && b[r][c] === b[r][c + 1]) return true;
          if (r < SIZE - 1 && b[r][c] === b[r + 1][c]) return true;
        }
      }
      return false;
    };

    const reset = () => {
      board = emptyBoard();
      score = 0;
      addTile(board);
      addTile(board);
      setStatus("Merge and climb.");
      render();
    };

    let sx = 0;
    let sy = 0;
    ctx.addEvent(grid, "touchstart", (e) => {
      const t = e.touches[0];
      sx = t.clientX;
      sy = t.clientY;
    }, { signal, passive: true });

    ctx.addEvent(grid, "touchend", (e) => {
      const t = e.changedTouches[0];
      const dx = t.clientX - sx;
      const dy = t.clientY - sy;
      if (Math.abs(dx) < 20 && Math.abs(dy) < 20) return;
      if (Math.abs(dx) > Math.abs(dy)) move(dx > 0 ? "right" : "left");
      else move(dy > 0 ? "down" : "up");
    }, { signal, passive: true });

    ctx.addEvent(window, "keydown", (e) => {
      if (e.key === "ArrowLeft") move("left");
      if (e.key === "ArrowRight") move("right");
      if (e.key === "ArrowUp") move("up");
      if (e.key === "ArrowDown") move("down");
    }, { signal });

    setStatus("Merge and climb.");
    render();
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
