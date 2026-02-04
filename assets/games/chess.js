/* ============================================================================
  Project Odysseus Arcade — Chess ("Aegean Chess") [PRODUCTION]
  - Local 2-player (no backend)
  - Legal moves + check safety
  - Castling + automatic promotion to Queen
  - No en passant / no repetition-draw tracking (intentional scope)
  - Save/Resume + Undo + Flip board
  - Lifecycle cleanup: AbortController auto-aborts when root is removed
============================================================================ */

import { preloadSprites } from "../arcade/spriteLoader.js";

"use strict";

const GAME_ID = "chess";
const STORAGE_KEY = "po_arcade_chess_v1";
const STATS_KEY = "odyssey_stats_chess_v1";

const SPRITE_MANIFEST = {
  wP: new URL("../arcade/sprites/chess/wp.svg", import.meta.url).href,
  wN: new URL("../arcade/sprites/chess/wn.svg", import.meta.url).href,
  wB: new URL("../arcade/sprites/chess/wb.svg", import.meta.url).href,
  wR: new URL("../arcade/sprites/chess/wr.svg", import.meta.url).href,
  wQ: new URL("../arcade/sprites/chess/wq.svg", import.meta.url).href,
  wK: new URL("../arcade/sprites/chess/wk.svg", import.meta.url).href,
  bP: new URL("../arcade/sprites/chess/bp.svg", import.meta.url).href,
  bN: new URL("../arcade/sprites/chess/bn.svg", import.meta.url).href,
  bB: new URL("../arcade/sprites/chess/bb.svg", import.meta.url).href,
  bR: new URL("../arcade/sprites/chess/br.svg", import.meta.url).href,
  bQ: new URL("../arcade/sprites/chess/bq.svg", import.meta.url).href,
  bK: new URL("../arcade/sprites/chess/bk.svg", import.meta.url).href,
};

const UNICODE_PIECES = {
  wK: "♔",
  wQ: "♕",
  wR: "♖",
  wB: "♗",
  wN: "♘",
  wP: "♙",
  bK: "♚",
  bQ: "♛",
  bR: "♜",
  bB: "♝",
  bN: "♞",
  bP: "♟",
};

const PIECE_LABELS = {
  wK: "White king",
  wQ: "White queen",
  wR: "White rook",
  wB: "White bishop",
  wN: "White knight",
  wP: "White pawn",
  bK: "Black king",
  bQ: "Black queen",
  bR: "Black rook",
  bB: "Black bishop",
  bN: "Black knight",
  bP: "Black pawn",
};

  // --- Tiny DOM helper ------------------------------------------------------
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

const loadLegacy = () => { try { return JSON.parse(localStorage.getItem(STORAGE_KEY) || "null"); } catch { return null; } };
const saveLegacy = (s) => { try { localStorage.setItem(STORAGE_KEY, JSON.stringify(s)); } catch {} };
const clearLegacy = () => { try { localStorage.removeItem(STORAGE_KEY); } catch {} };

const defaultStats = {
  plays: 0,
  wins: 0,
  losses: 0,
  draws: 0,
  lastPlayed: null,
  currentStreak: 0,
  bestStreak: 0,
};

const loadStats = (store) => {
  let stats = null;
  try { stats = JSON.parse(localStorage.getItem(STATS_KEY) || "null"); } catch { stats = null; }

  if (!stats || typeof stats !== "object") stats = { ...defaultStats };

  const hasAny = stats.plays || stats.wins || stats.losses || stats.draws;
  if (!hasAny && store?.get) {
    const legacy = store.get()?.games?.chess;
    if (legacy) {
      const wins = Number(legacy.winsW || 0);
      const losses = Number(legacy.winsB || 0);
      const draws = Number(legacy.draws || 0);
      const plays = wins + losses + draws;
      stats = { ...stats, wins, losses, draws, plays };
    }
  }

  return { ...defaultStats, ...stats };
};

const saveStats = (stats) => {
  try { localStorage.setItem(STATS_KEY, JSON.stringify(stats)); } catch {}
};

  // --- Chess core -----------------------------------------------------------

  const colorOf = (p) => (p ? p[0] : null); // 'w'|'b'|null
  const typeOf  = (p) => (p ? p[1] : null); // 'P','N','B','R','Q','K'

  const inBounds = (r, c) => r >= 0 && r < 8 && c >= 0 && c < 8;
  const idx = (r, c) => r * 8 + c;
  const rcFrom = (i) => [Math.floor(i / 8), i % 8];

  function initialBoard() {
    // r=0 is black home rank, r=7 is white home rank
    const b = Array(64).fill(null);
    const back = ["R","N","B","Q","K","B","N","R"];
    for (let c = 0; c < 8; c++) {
      b[idx(0,c)] = "b" + back[c];
      b[idx(1,c)] = "bP";
      b[idx(6,c)] = "wP";
      b[idx(7,c)] = "w" + back[c];
    }
    return b;
  }

  function cloneState(s) {
    return {
      v: s.v,
      board: s.board.slice(),
      turn: s.turn,
      selected: s.selected,
      flipped: s.flipped,
      // castling rights
      castle: { ...s.castle },
      // last move (for UI)
      last: s.last ? { ...s.last } : null,
      // history (for undo)
      history: s.history.map(h => ({
        board: h.board.slice(),
        turn: h.turn,
        castle: { ...h.castle },
        last: h.last ? { ...h.last } : null,
      })),
    };
  }

  function findKing(board, side) {
    const target = side + "K";
    for (let i = 0; i < 64; i++) if (board[i] === target) return i;
    return -1;
  }

  function isSquareAttacked(board, sq, bySide) {
    // bySide attacks sq?
    const [r, c] = rcFrom(sq);

    // pawns
    if (bySide === "w") {
      // white pawns attack up (toward decreasing r): (r-1,c-1),(r-1,c+1)
      const r1 = r - 1;
      if (r1 >= 0) {
        if (c - 1 >= 0 && board[idx(r1, c - 1)] === "wP") return true;
        if (c + 1 < 8 && board[idx(r1, c + 1)] === "wP") return true;
      }
    } else {
      // black pawns attack down (toward increasing r)
      const r1 = r + 1;
      if (r1 < 8) {
        if (c - 1 >= 0 && board[idx(r1, c - 1)] === "bP") return true;
        if (c + 1 < 8 && board[idx(r1, c + 1)] === "bP") return true;
      }
    }

    // knights
    const KN = [[-2,-1],[-2,1],[-1,-2],[-1,2],[1,-2],[1,2],[2,-1],[2,1]];
    for (const [dr, dc] of KN) {
      const rr = r + dr, cc = c + dc;
      if (!inBounds(rr, cc)) continue;
      const p = board[idx(rr, cc)];
      if (p === bySide + "N") return true;
    }

    // bishops/queens (diagonals)
    const D = [[-1,-1],[-1,1],[1,-1],[1,1]];
    for (const [dr, dc] of D) {
      let rr = r + dr, cc = c + dc;
      while (inBounds(rr, cc)) {
        const p = board[idx(rr, cc)];
        if (p) {
          if (colorOf(p) === bySide && (typeOf(p) === "B" || typeOf(p) === "Q")) return true;
          break;
        }
        rr += dr; cc += dc;
      }
    }

    // rooks/queens (orthogonal)
    const O = [[-1,0],[1,0],[0,-1],[0,1]];
    for (const [dr, dc] of O) {
      let rr = r + dr, cc = c + dc;
      while (inBounds(rr, cc)) {
        const p = board[idx(rr, cc)];
        if (p) {
          if (colorOf(p) === bySide && (typeOf(p) === "R" || typeOf(p) === "Q")) return true;
          break;
        }
        rr += dr; cc += dc;
      }
    }

    // king
    for (let dr = -1; dr <= 1; dr++) for (let dc = -1; dc <= 1; dc++) {
      if (!dr && !dc) continue;
      const rr = r + dr, cc = c + dc;
      if (!inBounds(rr, cc)) continue;
      if (board[idx(rr, cc)] === bySide + "K") return true;
    }

    return false;
  }

  function inCheck(board, side) {
    const k = findKing(board, side);
    if (k < 0) return false; // should never happen
    const opp = side === "w" ? "b" : "w";
    return isSquareAttacked(board, k, opp);
  }

  function pushRayMoves(moves, board, from, side, dr, dc) {
    const [r, c] = rcFrom(from);
    let rr = r + dr, cc = c + dc;
    while (inBounds(rr, cc)) {
      const to = idx(rr, cc);
      const t = board[to];
      if (!t) moves.push({ from, to });
      else {
        if (colorOf(t) !== side) moves.push({ from, to });
        break;
      }
      rr += dr; cc += dc;
    }
  }

  function pseudoMovesFor(board, from, side, castle) {
    const p = board[from];
    if (!p || colorOf(p) !== side) return [];
    const t = typeOf(p);
    const [r, c] = rcFrom(from);

    const moves = [];

    if (t === "P") {
      const dir = side === "w" ? -1 : 1;
      const startRow = side === "w" ? 6 : 1;
      const promoteRow = side === "w" ? 0 : 7;

      // forward 1
      const r1 = r + dir;
      if (inBounds(r1, c) && !board[idx(r1, c)]) {
        const to = idx(r1, c);
        if (r1 === promoteRow) moves.push({ from, to, promo: "Q" });
        else moves.push({ from, to });

        // forward 2 from start
        const r2 = r + 2 * dir;
        if (r === startRow && inBounds(r2, c) && !board[idx(r2, c)]) {
          moves.push({ from, to: idx(r2, c) });
        }
      }

      // captures
      for (const dc of [-1, 1]) {
        const cc = c + dc;
        if (!inBounds(r1, cc)) continue;
        const to = idx(r1, cc);
        const tp = board[to];
        if (tp && colorOf(tp) !== side) {
          if (r1 === promoteRow) moves.push({ from, to, promo: "Q" });
          else moves.push({ from, to });
        }
      }

      // no en passant by design
      return moves;
    }

    if (t === "N") {
      const KN = [[-2,-1],[-2,1],[-1,-2],[-1,2],[1,-2],[1,2],[2,-1],[2,1]];
      for (const [dr, dc] of KN) {
        const rr = r + dr, cc = c + dc;
        if (!inBounds(rr, cc)) continue;
        const to = idx(rr, cc);
        const tp = board[to];
        if (!tp || colorOf(tp) !== side) moves.push({ from, to });
      }
      return moves;
    }

    if (t === "B") {
      pushRayMoves(moves, board, from, side, -1,-1);
      pushRayMoves(moves, board, from, side, -1, 1);
      pushRayMoves(moves, board, from, side,  1,-1);
      pushRayMoves(moves, board, from, side,  1, 1);
      return moves;
    }

    if (t === "R") {
      pushRayMoves(moves, board, from, side, -1, 0);
      pushRayMoves(moves, board, from, side,  1, 0);
      pushRayMoves(moves, board, from, side,  0,-1);
      pushRayMoves(moves, board, from, side,  0, 1);
      return moves;
    }

    if (t === "Q") {
      pushRayMoves(moves, board, from, side, -1,-1);
      pushRayMoves(moves, board, from, side, -1, 1);
      pushRayMoves(moves, board, from, side,  1,-1);
      pushRayMoves(moves, board, from, side,  1, 1);
      pushRayMoves(moves, board, from, side, -1, 0);
      pushRayMoves(moves, board, from, side,  1, 0);
      pushRayMoves(moves, board, from, side,  0,-1);
      pushRayMoves(moves, board, from, side,  0, 1);
      return moves;
    }

    if (t === "K") {
      for (let dr = -1; dr <= 1; dr++) for (let dc = -1; dc <= 1; dc++) {
        if (!dr && !dc) continue;
        const rr = r + dr, cc = c + dc;
        if (!inBounds(rr, cc)) continue;
        const to = idx(rr, cc);
        const tp = board[to];
        if (!tp || colorOf(tp) !== side) moves.push({ from, to });
      }

      // castling (standard squares only)
      // White king starts e1 (7,4). Black king starts e8 (0,4).
      // Rooks a/h files.
      const opp = side === "w" ? "b" : "w";
      const kingStart = side === "w" ? idx(7,4) : idx(0,4);
      if (from === kingStart) {
        const inChk = inCheck(board, side);
        if (!inChk) {
          // king-side: e1->g1, rook h1->f1
          if (castle[side + "K"]) {
            const f = side === "w" ? idx(7,5) : idx(0,5);
            const g = side === "w" ? idx(7,6) : idx(0,6);
            const rookFrom = side === "w" ? idx(7,7) : idx(0,7);
            if (board[rookFrom] === side + "R" && !board[f] && !board[g]) {
              if (!isSquareAttacked(board, f, opp) && !isSquareAttacked(board, g, opp)) {
                moves.push({ from, to: g, castle: "K" });
              }
            }
          }
          // queen-side: e1->c1, rook a1->d1
          if (castle[side + "Q"]) {
            const d = side === "w" ? idx(7,3) : idx(0,3);
            const c1 = side === "w" ? idx(7,2) : idx(0,2);
            const b1 = side === "w" ? idx(7,1) : idx(0,1);
            const rookFrom = side === "w" ? idx(7,0) : idx(0,0);
            if (board[rookFrom] === side + "R" && !board[d] && !board[c1] && !board[b1]) {
              if (!isSquareAttacked(board, d, opp) && !isSquareAttacked(board, c1, opp)) {
                moves.push({ from, to: c1, castle: "Q" });
              }
            }
          }
        }
      }

      return moves;
    }

    return moves;
  }

  function applyMove(board, move, side, castle) {
    // returns { board, castle, captured, movedPiece, special }
    const b = board.slice();
    const fromP = b[move.from];
    const toP = b[move.to];
    b[move.from] = null;

    let special = null;
    let placed = fromP;

    // promotion
    if (move.promo && typeOf(fromP) === "P") {
      placed = side + move.promo; // default Q
      special = "promo";
    }

    // castling
    if (move.castle && typeOf(fromP) === "K") {
      special = "castle";
      // king already goes to move.to; now move rook
      if (move.castle === "K") {
        const rookFrom = side === "w" ? idx(7,7) : idx(0,7);
        const rookTo   = side === "w" ? idx(7,5) : idx(0,5);
        b[rookTo] = b[rookFrom];
        b[rookFrom] = null;
      } else {
        const rookFrom = side === "w" ? idx(7,0) : idx(0,0);
        const rookTo   = side === "w" ? idx(7,3) : idx(0,3);
        b[rookTo] = b[rookFrom];
        b[rookFrom] = null;
      }
    }

    b[move.to] = placed;

    // update castling rights
    const c2 = { ...castle };

    // king moved => lose both
    if (typeOf(fromP) === "K") {
      c2[side + "K"] = false;
      c2[side + "Q"] = false;
    }

    // rook moved from corner => lose that side
    if (typeOf(fromP) === "R") {
      if (side === "w") {
        if (move.from === idx(7,7)) c2.wK = false;
        if (move.from === idx(7,0)) c2.wQ = false;
      } else {
        if (move.from === idx(0,7)) c2.bK = false;
        if (move.from === idx(0,0)) c2.bQ = false;
      }
    }

    // rook captured on corner => lose opponent’s castling on that side
    if (toP && typeOf(toP) === "R") {
      const opp = side === "w" ? "b" : "w";
      if (opp === "w") {
        if (move.to === idx(7,7)) c2.wK = false;
        if (move.to === idx(7,0)) c2.wQ = false;
      } else {
        if (move.to === idx(0,7)) c2.bK = false;
        if (move.to === idx(0,0)) c2.bQ = false;
      }
    }

    return { board: b, castle: c2, captured: toP || null, movedPiece: fromP, special };
  }

  function legalMovesForSquare(state, from) {
    const side = state.turn;
    const opp = side === "w" ? "b" : "w";
    const p = state.board[from];
    if (!p || colorOf(p) !== side) return [];

    const pseudos = pseudoMovesFor(state.board, from, side, state.castle);
    const legals = [];

    for (const m of pseudos) {
      if (state.board[m.to] === opp + "K") continue;
      const res = applyMove(state.board, m, side, state.castle);
      if (!inCheck(res.board, side)) legals.push(m);
    }
    return legals;
  }

  function allLegalMoves(state, side) {
    const moves = [];
    const opp = side === "w" ? "b" : "w";
    for (let i = 0; i < 64; i++) {
      const p = state.board[i];
      if (!p || colorOf(p) !== side) continue;
      const pseudos = pseudoMovesFor(state.board, i, side, state.castle);
      for (const m of pseudos) {
        if (state.board[m.to] === opp + "K") continue;
        const res = applyMove(state.board, m, side, state.castle);
        if (!inCheck(res.board, side)) moves.push(m);
      }
    }
    return moves;
  }

  function outcomeText(state) {
    const side = state.turn;
    const opp = side === "w" ? "b" : "w";
    const inChk = inCheck(state.board, side);
    const moves = allLegalMoves(state, side);

    if (moves.length === 0) {
      if (inChk) return { done: true, text: (side === "w" ? "Checkmate. Black triumphs." : "Checkmate. White triumphs.") };
      return { done: true, text: "Stalemate. The sea goes still." };
    }

    if (inChk) return { done: false, text: (side === "w" ? "White to move — in check." : "Black to move — in check.") };
    return { done: false, text: (side === "w" ? "White to move." : "Black to move.") };
  }

// --- UI -------------------------------------------------------------------
async function mount(root, ctx) {
  root.innerHTML = "";

  const ui = ctx.ui;
  const store = ctx.store;

  const resetBtn = el("button", { class: "po-btn po-btn--primary", type: "button" }, ["New Game"]);
  const undoBtn  = el("button", { class: "po-btn", type: "button" }, ["Undo"]);
  const flipBtn  = el("button", { class: "po-btn", type: "button" }, ["Flip"]);
  const clearBtn = el("button", { class: "po-btn po-btn--ghost", type: "button" }, ["Clear Save"]);

  const controls = el("div", { class: "po-pillrow" }, [
    resetBtn, undoBtn, flipBtn, clearBtn,
  ]);

  ui?.setControls?.(controls);
  ui?.setHUD?.([
    { k: "Mode", v: "2P" },
    { k: "Rules", v: "Legal" },
  ]);

  const board = el("div", { class: "po-ch-board", role: "grid", "aria-label": "Chess board", tabindex: "0" });
  root.append(board);

  let sprites = {};
  let spritesFailed = false;
  try {
    ui?.setStatus?.("Loading chess set...");
    const result = await preloadSprites(SPRITE_MANIFEST, { timeoutMs: 3500 });
    sprites = result.sprites || {};
    spritesFailed = Boolean(result.failed || result.timedOut);
  } catch {
    spritesFailed = true;
  }

  if (spritesFailed) {
    ui?.showToast?.("Sprite load failed — using unicode pieces.");
  }

  // Build 64 cells
  const cells = [];
  for (let i = 0; i < 64; i++) {
    const btn = el("button", {
      class: "po-ch-square",
      type: "button",
      role: "gridcell",
      "aria-label": `Square ${i + 1}`,
    });
    cells.push(btn);
    board.appendChild(btn);
  }

  const restored = store?.get?.()?.games?.[GAME_ID]?.save || loadLegacy();
  const state = (restored && restored.v === 1 && Array.isArray(restored.board) && restored.board.length === 64)
    ? restored
    : {
        v: 1,
        board: initialBoard(),
        turn: "w",
        selected: -1,
        flipped: false,
        castle: { wK: true, wQ: true, bK: true, bQ: true },
        last: null,
        history: [],
        done: false,
      };

  if (state.done == null) state.done = false;

  const stats = loadStats(store);
  let statsRecorded = false;

  function persist() {
    store?.updateGame?.(GAME_ID, () => ({ save: state }));
    saveLegacy(state);
  }

    function sqToHuman(i) {
      const [r, c] = rcFrom(i);
      const file = "abcdefgh"[c];
      const rank = String(8 - r);
      return file + rank;
    }

    function orientIndex(displayIndex) {
      // displayIndex 0..63 from top-left of UI grid
      // if not flipped: maps to board idx (r,c) same
      // if flipped: rotate 180 degrees
      if (!state.flipped) return displayIndex;
      const [r, c] = rcFrom(displayIndex);
      return idx(7 - r, 7 - c);
    }

    function displayIndexFromBoardIndex(boardIndex) {
      if (!state.flipped) return boardIndex;
      const [r, c] = rcFrom(boardIndex);
      return idx(7 - r, 7 - c);
    }

    function setStatus(msg) { ui?.setStatus?.(msg); }

    function createPieceNode(piece) {
      if (!piece) return null;
      const sprite = sprites?.[piece];
      if (sprite?.src) {
        return el("img", {
          class: "po-ch-piece-img",
          src: sprite.src,
          alt: PIECE_LABELS[piece] || "Chess piece",
          draggable: "false",
        });
      }

      const unicode = UNICODE_PIECES[piece] || "";
      return el("span", { class: "po-ch-piece-unicode", text: unicode });
    }

    function recordOutcome(result) {
      if (statsRecorded) return;
      statsRecorded = true;
      stats.plays += 1;
      stats.lastPlayed = Date.now();

      if (result === "w") {
        stats.wins += 1;
        stats.currentStreak += 1;
      } else if (result === "b") {
        stats.losses += 1;
        stats.currentStreak = 0;
      } else {
        stats.draws += 1;
        stats.currentStreak = 0;
      }

      stats.bestStreak = Math.max(stats.bestStreak || 0, stats.currentStreak || 0);
      saveStats(stats);
    }

    function clearHighlights() {
      for (const cell of cells) {
        cell.classList.remove("is-selected", "is-legal", "is-last", "is-capture", "is-check");
      }
    }

    function render() {
      // paint check marker on king square if in check
      const inChk = inCheck(state.board, state.turn);
      const kingSq = findKing(state.board, state.turn);

      for (let di = 0; di < 64; di++) {
        const bi = orientIndex(di);
        const cell = cells[di];

        // base coloring via classes (you can style .is-dark/.is-light in CSS)
        const [r, c] = rcFrom(di);
        const dark = (r + c) % 2 === 1;
        cell.className = "po-ch-square " + (dark ? "is-dark" : "is-light");

        const sq = sqToHuman(bi);
        cell.dataset.sq = sq;
        cell.dataset.file = sq[0];
        cell.dataset.rank = sq[1];
        cell.setAttribute("aria-label", `Square ${sq}`);

        const p = state.board[bi];
        if (p) {
          cell.classList.add("has-piece");
          const node = createPieceNode(p);
          cell.replaceChildren(node);
        } else {
          cell.classList.remove("has-piece");
          cell.replaceChildren();
        }

        if (state.last && (bi === state.last.from || bi === state.last.to)) cell.classList.add("is-last");
      }

      clearHighlights();

      if (state.selected >= 0) {
        const sdi = displayIndexFromBoardIndex(state.selected);
        cells[sdi].classList.add("is-selected");

        const legals = legalMovesForSquare(state, state.selected);
        for (const m of legals) {
          const tdi = displayIndexFromBoardIndex(m.to);
          cells[tdi].classList.add("is-legal");
          const tp = state.board[m.to];
          if (tp) cells[tdi].classList.add("is-capture");
        }
      }

      if (inChk && kingSq >= 0) {
        const kdi = displayIndexFromBoardIndex(kingSq);
        cells[kdi].classList.add("is-check");
      }

      undoBtn.disabled = state.history.length === 0;

      const out = outcomeText(state);
      setStatus(out.text);

      if (out.done && !state.done) {
        state.done = true;
        const inChk = inCheck(state.board, state.turn);
        const result = inChk ? (state.turn === "w" ? "b" : "w") : "draw";
        recordOutcome(result);

        ui?.showModal?.({
          title: inChk ? "Checkmate" : "Stalemate",
          body: out.text,
          actions: [
            { label: "Restart", primary: true, onClick: () => resetBoard() },
            { label: "Back to Arcade", onClick: () => window.location.assign("/arcade/") },
          ],
        });
      }
      persist();
    }

    function setSelected(i) {
      state.selected = i;
      render();
    }

    function pushHistory() {
      state.history.push({
        board: state.board.slice(),
        turn: state.turn,
        castle: { ...state.castle },
        last: state.last ? { ...state.last } : null,
      });
      // keep history bounded
      if (state.history.length > 200) state.history.shift();
    }

    function doUndo() {
      const h = state.history.pop();
      if (!h) return;
      state.board = h.board.slice();
      state.turn = h.turn;
      state.castle = { ...h.castle };
      state.last = h.last ? { ...h.last } : null;
      state.selected = -1;
      state.done = false;
      render();
    }

    function makeMove(from, to) {
      const side = state.turn;
      const legals = legalMovesForSquare(state, from);
      const chosen = legals.find(m => m.to === to);
      if (!chosen) return false;

      pushHistory();

      const res = applyMove(state.board, chosen, side, state.castle);
      state.board = res.board;
      state.castle = res.castle;

      // auto-promotion already handled (Queen)
      const moved = state.board[to];

      state.last = { from, to, moved, captured: res.captured, special: res.special || null };
      state.selected = -1;

      // swap turn
      state.turn = side === "w" ? "b" : "w";

      render();
      return true;
    }

    function onSquareClick(boardIndex) {
      if (state.done) return;
      const side = state.turn;
      const p = state.board[boardIndex];

      // if nothing selected yet
      if (state.selected < 0) {
        if (p && colorOf(p) === side) setSelected(boardIndex);
        return;
      }

      // selected exists
      const sel = state.selected;
      if (boardIndex === sel) {
        setSelected(-1);
        return;
      }

      // clicking own piece switches selection
      if (p && colorOf(p) === side) {
        setSelected(boardIndex);
        return;
      }

      // attempt move
      const ok = makeMove(sel, boardIndex);
      if (!ok) {
        // keep selection, but if clicked empty/illegal: do nothing
        return;
      }
    }

    // Wire board clicks
    function resetBoard() {
      state.board = initialBoard();
      state.turn = "w";
      state.selected = -1;
      state.castle = { wK: true, wQ: true, bK: true, bQ: true };
      state.last = null;
      state.history = [];
      state.done = false;
      statsRecorded = false;
      render();
    }

    ctx.addEvent(board, "touchmove", (e) => {
      e.preventDefault();
    }, { passive: false });

    cells.forEach((cell, di) => {
      ctx.addEvent(cell, "click", () => {
        const bi = orientIndex(di);
        onSquareClick(bi);
      });
    });

    ctx.addEvent(resetBtn, "click", () => resetBoard());
    ctx.addEvent(undoBtn, "click", () => doUndo());
    ctx.addEvent(flipBtn, "click", () => {
      state.flipped = !state.flipped;
      state.selected = -1;
      render();
    });
    ctx.addEvent(clearBtn, "click", () => {
      clearLegacy();
      store?.updateGame?.(GAME_ID, () => ({ save: null }));
      resetBoard();
    });

    // Keyboard: Escape deselect, U undo, F flip
    ctx.addEvent(window, "keydown", (e) => {
      const k = e.key;
      if (k === "Escape") { state.selected = -1; render(); }
      if (k === "u" || k === "U") doUndo();
      if (k === "f" || k === "F") { state.flipped = !state.flipped; state.selected = -1; render(); }
    });

    // Initial render + sanitize restored state
    if (!state.castle || typeof state.castle !== "object") state.castle = { wK: true, wQ: true, bK: true, bQ: true };
    if (!Array.isArray(state.history)) state.history = [];
    if (typeof state.flipped !== "boolean") state.flipped = false;
    if (typeof state.turn !== "string") state.turn = "w";
    if (!Array.isArray(state.board) || state.board.length !== 64) state.board = initialBoard();
    state.selected = -1;

    render();
  }

export default {
  init(ctx) {
    return mount(ctx.root, ctx);
  },
};
