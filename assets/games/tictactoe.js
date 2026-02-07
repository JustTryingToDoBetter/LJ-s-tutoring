/**
 * Tic Tac Toe — Module lifecycle version
 * - Renders inside the shared Game Frame (ctx.ui)
 * - Uses AbortController cleanup + clears pending AI timeouts
 * - Preserves existing AI logic (3x3 minimax, 4x4 depth-limited negamax)
 */

import { el, clear } from "../lib/ui.js";
import { dayKey, hashStringToSeed, seededRng } from "../lib/rng.js";

const STORAGE_KEY = "po_arcade_tictactoe_v3";

const load = () => { try { return JSON.parse(localStorage.getItem(STORAGE_KEY) || "null"); } catch { return null; } };
const save = (s) => { try { localStorage.setItem(STORAGE_KEY, JSON.stringify(s)); } catch {} };
const clearSave = () => { try { localStorage.removeItem(STORAGE_KEY); } catch {} };

function makeLines(n, winLen) {
  const lines = [];
  for (let r = 0; r < n; r++) for (let c = 0; c <= n - winLen; c++) {
    const L = [];
    for (let k = 0; k < winLen; k++) L.push(r * n + (c + k));
    lines.push(L);
  }
  for (let c = 0; c < n; c++) for (let r = 0; r <= n - winLen; r++) {
    const L = [];
    for (let k = 0; k < winLen; k++) L.push((r + k) * n + c);
    lines.push(L);
  }
  for (let r = 0; r <= n - winLen; r++) for (let c = 0; c <= n - winLen; c++) {
    const L = [];
    for (let k = 0; k < winLen; k++) L.push((r + k) * n + (c + k));
    lines.push(L);
  }
  for (let r = 0; r <= n - winLen; r++) for (let c = winLen - 1; c < n; c++) {
    const L = [];
    for (let k = 0; k < winLen; k++) L.push((r + k) * n + (c - k));
    lines.push(L);
  }
  return lines;
}

function winnerOf(board, lines) {
  for (const L of lines) {
    const a = board[L[0]];
    if (!a) continue;
    let ok = true;
    for (let i = 1; i < L.length; i++) if (board[L[i]] !== a) { ok = false; break; }
    if (ok) return a;
  }
  return board.every(Boolean) ? "draw" : null;
}

function winningLine(board, lines) {
  for (const L of lines) {
    const a = board[L[0]];
    if (!a) continue;
    let ok = true;
    for (let i = 1; i < L.length; i++) if (board[L[i]] !== a) { ok = false; break; }
    if (ok) return L;
  }
  return null;
}

// 3x3 minimax (O is AI)
function minimax3(board, lines, isAiTurn, depth) {
  const out = winnerOf(board, lines);
  if (out) {
    if (out === "O") return { score: 10 - depth };
    if (out === "X") return { score: depth - 10 };
    return { score: 0 };
  }
  const moves = [];
  for (let i = 0; i < 9; i++) {
    if (board[i]) continue;
    const next = board.slice();
    next[i] = isAiTurn ? "O" : "X";
    const r = minimax3(next, lines, !isAiTurn, depth + 1);
    moves.push({ idx: i, score: r.score });
  }
  return isAiTurn
    ? moves.reduce((b, m) => (m.score > b.score ? m : b), moves[0])
    : moves.reduce((b, m) => (m.score < b.score ? m : b), moves[0]);
}

// 4x4 heuristic + negamax
function heuristic(board, lines, me, opp) {
  let score = 0;
  for (const L of lines) {
    let m = 0, o = 0, e = 0;
    for (const i of L) {
      if (board[i] === me) m++;
      else if (board[i] === opp) o++;
      else e++;
    }
    if (m && o) continue;
    if (m === 4) score += 10_000;
    else if (o === 4) score -= 10_000;
    else if (m === 3 && e === 1) score += 180;
    else if (o === 3 && e === 1) score -= 220;
    else if (m === 2 && e === 2) score += 25;
    else if (o === 2 && e === 2) score -= 30;
    else if (m === 1 && e === 3) score += 3;
    else if (o === 1 && e === 3) score -= 3;
  }
  return score;
}

function negamax(board, lines, depth, alpha, beta, player, me, opp) {
  const out = winnerOf(board, lines);
  if (out) {
    if (out === me) return { score: 10_000 + depth };
    if (out === opp) return { score: -(10_000 + depth) };
    return { score: 0 };
  }
  if (depth === 0) return { score: heuristic(board, lines, me, opp) };

  let best = { score: -Infinity, idx: null };
  for (let i = 0; i < board.length; i++) {
    if (board[i]) continue;
    board[i] = player;

    const next = negamax(board, lines, depth - 1, -beta, -alpha, player === me ? opp : me, me, opp);
    const score = -next.score;

    board[i] = null;

    if (score > best.score) best = { score, idx: i };
    alpha = Math.max(alpha, score);
    if (alpha >= beta) break;
  }
  return best;
}

function cyclopsPersonality() {
  const rng = seededRng(hashStringToSeed(`po-cyclops-${dayKey()}`));
  const x = rng();
  if (x < 0.33) return { name: "Aggressive", depth4: 5 };
  if (x < 0.66) return { name: "Defensive", depth4: 6 };
  return { name: "Balanced", depth4: 5 };
}

export default {
  _ac: null,
  _aiTimer: null,
  _root: null,
  _ctx: null,

  init(ctx) {
    return this.mount(ctx.root, ctx);
  },

  async mount(root, ctx) {
    this._root = root;
    this._ctx = ctx;

    clear(root);

    // Cleanup signal for event listeners
    this._ac = new AbortController();
    const { signal } = this._ac;

    const ui = ctx.ui;
    const storage = ctx.storage;
    const personality = cyclopsPersonality();

    const restored = load();
    const state = restored?.v === 3 ? restored : {
      v: 3,
      mode: "ai",     // ai | friend
      size: 3,        // 3 | 4
      winLen: 3,
      board: Array(9).fill(null),
      turn: "X",
      status: "Your move, Navigator.",
      lastKey: dayKey(),
      lastMove: null,
    };

    if (typeof state.lastMove !== "number") state.lastMove = null;

    const specFromSize = (sz) => (sz === 4 ? { size: 4, winLen: 4 } : { size: 3, winLen: 3 });
    const persist = () => save(state);

    // Frame HUD + status
    ui?.setHUD?.([
      { k: "Mode", v: state.mode === "ai" ? "Cyclops" : "Friend" },
      { k: "Board", v: state.size === 4 ? "4×4" : "3×3" },
      { k: "AI", v: personality.name },
    ]);
    ui?.setStatus?.(state.status);

    // Controls
    const modeSelect = el("select", { class: "po-select", "aria-label": "Select mode" }, [
      el("option", { value: "ai", text: "Vs Cyclops (AI)" }),
      el("option", { value: "friend", text: "Vs Friend (Local)" }),
    ]);
    modeSelect.value = state.mode;

    const sizeSelect = el("select", { class: "po-select", "aria-label": "Select board size" }, [
      el("option", { value: "3", text: "3×3 Classic" }),
      el("option", { value: "4", text: "4×4 Storm Grid" }),
    ]);
    sizeSelect.value = String(state.size);

    const resetBtn = el("button", { class: "po-btn po-btn--primary", type: "button" }, ["Reset"]);
    const clearBtn = el("button", { class: "po-btn po-btn--ghost", type: "button" }, ["Clear Save"]);

    const controlsRow = el("div", { class: "po-pillrow" }, [modeSelect, sizeSelect, resetBtn, clearBtn]);
    ui?.setControls?.(controlsRow);

    // Stage (board)
    const wrap = el("div", { class: "po-ttt-wrap" });
    const indicator = el("div", { class: "po-ttt-indicator", text: "" });
    const sub = el("div", { class: "po-ttt-sub", text: "Tap a square to place your mark." });
    const grid = el("div", { class: "po-ttt-grid", role: "grid", "aria-label": "Tic Tac Toe board" });
    wrap.append(indicator, sub, grid);
    root.append(wrap);

    const setStatus = (t) => ui?.setStatus?.(t);

    function rebuildGrid() {
      clear(grid);

      grid.style.gridTemplateColumns = `repeat(${state.size}, 1fr)`;
      const lines = makeLines(state.size, state.winLen);

      for (let i = 0; i < state.size * state.size; i++) {
        const btn = el("button", {
          class: "po-ttt-cell",
          type: "button",
          role: "gridcell",
          "aria-label": `Cell ${i + 1}`,
        });

        btn.addEventListener("click", () => move(i, lines), { signal });
        grid.append(btn);
      }

      render(lines);
    }

    function render(lines) {
      const cells = Array.from(grid.querySelectorAll("button"));
      const out = winnerOf(state.board, lines);
      const winLine = out && out !== "draw" ? winningLine(state.board, lines) : null;
      const winSet = new Set(winLine || []);

      indicator.textContent = out
        ? (out === "draw" ? "Stalemate" : `Winner: ${out}`)
        : `Turn: ${state.turn}`;

      for (let i = 0; i < cells.length; i++) {
        const cell = cells[i];
        const value = state.board[i] || "";
        cell.textContent = value;
        cell.disabled = Boolean(state.board[i]) || Boolean(out);
        cell.classList.toggle("is-x", value === "X");
        cell.classList.toggle("is-o", value === "O");
        cell.classList.toggle("is-last", state.lastMove === i);
        cell.classList.toggle("is-win", winSet.has(i));
      }
    }

    function endIfNeeded(lines) {
      const out = winnerOf(state.board, lines);
      if (!out) return false;

      if (out === "draw") state.status = "A stalemate at sea. Try again.";
      else if (out === "X") state.status = state.mode === "ai" ? "Victory! The Cyclops falls." : "Player X conquers.";
      else state.status = state.mode === "ai" ? "Defeat… the Cyclops laughs." : "Player O conquers.";

      setStatus(state.status);
      render(lines);
      const stats = storage?.get?.();
      if (stats && storage?.update) {
        storage.update({
          wins: stats.wins + (out === "X" ? 1 : 0),
          losses: stats.losses + (out === "O" ? 1 : 0),
          draws: stats.draws + (out === "draw" ? 1 : 0),
        });
      }
      persist();
      return true;
    }

    function cyclopsMove(lines) {
      if (winnerOf(state.board, lines)) return;

      if (state.size === 3) {
        const best = minimax3(state.board, lines, true, 0);
        if (typeof best.idx === "number") {
          state.board[best.idx] = "O";
          state.lastMove = best.idx;
        }
      } else {
        const depth = personality.depth4;
        const b = state.board.slice();
        const best = negamax(b, lines, depth, -Infinity, Infinity, "O", "O", "X");

        let pick = best.idx;
        if (pick == null) {
          for (let i = 0; i < state.board.length; i++) if (!state.board[i]) { pick = i; break; }
        }
        if (pick != null) {
          state.board[pick] = "O";
          state.lastMove = pick;
        }
      }

      state.turn = "X";
      state.status = "Your move, Navigator.";
      setStatus(state.status);
      render(lines);
      persist();
      endIfNeeded(lines);
    }

    function resetBoard() {
      const { size, winLen } = specFromSize(Number(sizeSelect.value));
      state.size = size;
      state.winLen = winLen;
      state.board = Array(size * size).fill(null);
      state.turn = "X";
      state.status = state.mode === "ai" ? "Your move, Navigator." : "Player X begins the voyage.";
      state.lastMove = null;

      ui?.setHUD?.([
        { k: "Mode", v: state.mode === "ai" ? "Cyclops" : "Friend" },
        { k: "Board", v: state.size === 4 ? "4×4" : "3×3" },
        { k: "AI", v: personality.name },
      ]);

      setStatus(state.status);
      rebuildGrid();
      persist();
    }

    function move(i, lines) {
      if (state.board[i] || winnerOf(state.board, lines)) return;

      state.board[i] = state.turn;
      state.lastMove = i;

      if (state.mode === "friend") {
        state.turn = state.turn === "X" ? "O" : "X";
        state.status = `Player ${state.turn}'s move.`;
        setStatus(state.status);
        render(lines);
        persist();
        endIfNeeded(lines);
        return;
      }

      state.turn = "O";
      state.status = "The Cyclops considers…";
      setStatus(state.status);
      render(lines);
      persist();

      if (endIfNeeded(lines)) return;

      // clear old timer if any
      if (this._aiTimer) clearTimeout(this._aiTimer);
      this._aiTimer = setTimeout(() => cyclopsMove(lines), 160);
    }

    modeSelect.addEventListener("change", () => {
      state.mode = modeSelect.value;
      resetBoard();
    }, { signal });

    sizeSelect.addEventListener("change", () => resetBoard(), { signal });

    resetBtn.addEventListener("click", () => resetBoard(), { signal });
    clearBtn.addEventListener("click", () => { clearSave(); resetBoard(); }, { signal });

    // Init
    const expectedLen = (state.size || 3) * (state.size || 3);
    if (!Array.isArray(state.board) || state.board.length !== expectedLen) resetBoard();
    else {
      rebuildGrid();
      const lines = makeLines(state.size, state.winLen);
      if (state.mode === "ai" && state.turn === "O" && !winnerOf(state.board, lines)) {
        if (this._aiTimer) clearTimeout(this._aiTimer);
        this._aiTimer = setTimeout(() => cyclopsMove(lines), 160);
      }
    }
  },

  destroy() {
    try { this._ac?.abort?.(); } catch {}
    this._ac = null;

    if (this._aiTimer) {
      clearTimeout(this._aiTimer);
      this._aiTimer = null;
    }

    try { this._ctx?.ui?.setControls?.(null); } catch {}
    try { this._ctx?.ui?.setStatus?.(""); } catch {}
    try { this._ctx?.ui?.setHUD?.([]); } catch {}

    if (this._root) {
      try { clear(this._root); } catch {}
    }

    this._root = null;
    this._ctx = null;
  },

  resize() {
    // No-op for now (grid is responsive via CSS),
    // but keeping this hook makes mobile/orientation consistent across games.
  },

  pause() {
    // Could dim controls or show a status message; keep minimal for now.
  },

  resume() {
    // No-op for now.
  },
};