/* ============================================================================
  Project Odysseus Arcade — Chess ("Aegean Chess")
  - Local 2-player, no backend
  - Legal moves + check safety
  - Castling + promotion to Queen (simple, predictable)
  - No en passant / repetition draws (intentional scope)
============================================================================ */

(() => {
  "use strict";

  const GAME_ID = "chess";
  const STORAGE_KEY = "po_arcade_chess_v1";

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

  const inBounds = (r, c) => r >= 0 && r < 8 && c >= 0 && c < 8;

  // Pieces are encoded as:
  // "wP" white pawn, "bK" black king, etc.
  const START = [
    ["bR","bN","bB","bQ","bK","bB","bN","bR"],
    ["bP","bP","bP","bP","bP","bP","bP","bP"],
    [null,null,null,null,null,null,null,null],
    [null,null,null,null,null,null,null,null],
    [null,null,null,null,null,null,null,null],
    [null,null,null,null,null,null,null,null],
    ["wP","wP","wP","wP","wP","wP","wP","wP"],
    ["wR","wN","wB","wQ","wK","wB","wN","wR"],
  ];

  const PIECE_ICON = {
    wK:"♔", wQ:"♕", wR:"♖", wB:"♗", wN:"♘", wP:"♙",
    bK:"♚", bQ:"♛", bR:"♜", bB:"♝", bN:"♞", bP:"♟",
  };

  const cloneBoard = (b) => b.map(row => row.slice());

  const sideOf = (p) => (p ? p[0] : null);
  const typeOf = (p) => (p ? p[1] : null);
  const otherSide = (s) => (s === "w" ? "b" : "w");

  // --- Threat / check detection --------------------------------------------
  const findKing = (board, side) => {
    for (let r = 0; r < 8; r++) {
      for (let c = 0; c < 8; c++) {
        if (board[r][c] === `${side}K`) return { r, c };
      }
    }
    return null;
  };

  const isSquareAttacked = (board, bySide, tr, tc) => {
    // Scan all pieces of bySide; if any pseudo-move hits target, it's attacked.
    for (let r = 0; r < 8; r++) {
      for (let c = 0; c < 8; c++) {
        const p = board[r][c];
        if (!p || sideOf(p) !== bySide) continue;
        const moves = pseudoMoves(board, r, c, p, { forAttack: true });
        if (moves.some(m => m.r === tr && m.c === tc)) return true;
      }
    }
    return false;
  };

  const inCheck = (board, side) => {
    const k = findKing(board, side);
    if (!k) return false;
    return isSquareAttacked(board, otherSide(side), k.r, k.c);
  };

  // --- Move generation ------------------------------------------------------
  function pseudoMoves(board, r, c, piece, opts = {}) {
    const s = sideOf(piece);
    const t = typeOf(piece);
    const moves = [];

    const push = (rr, cc) => {
      if (!inBounds(rr, cc)) return;
      const target = board[rr][cc];
      if (!target) moves.push({ r: rr, c: cc });
      else if (sideOf(target) !== s) moves.push({ r: rr, c: cc, capture: true });
    };

    const slide = (dr, dc) => {
      let rr = r + dr, cc = c + dc;
      while (inBounds(rr, cc)) {
        const target = board[rr][cc];
        if (!target) moves.push({ r: rr, c: cc });
        else {
          if (sideOf(target) !== s) moves.push({ r: rr, c: cc, capture: true });
          break;
        }
        rr += dr; cc += dc;
      }
    };

    if (t === "P") {
      const dir = s === "w" ? -1 : 1;
      const startRow = s === "w" ? 6 : 1;

      // Attacks (always, forAttack includes these even if empty)
      for (const dc of [-1, 1]) {
        const rr = r + dir, cc = c + dc;
        if (!inBounds(rr, cc)) continue;
        const target = board[rr][cc];
        if (opts.forAttack) moves.push({ r: rr, c: cc });
        else if (target && sideOf(target) !== s) moves.push({ r: rr, c: cc, capture: true });
      }

      // Forward moves (not attacks)
      if (!opts.forAttack) {
        const one = r + dir;
        if (inBounds(one, c) && !board[one][c]) {
          moves.push({ r: one, c });
          const two = r + dir * 2;
          if (r === startRow && !board[two][c]) moves.push({ r: two, c });
        }
      }
    }

    if (t === "N") {
      const jumps = [
        [-2,-1],[-2,1],[-1,-2],[-1,2],
        [1,-2],[1,2],[2,-1],[2,1],
      ];
      for (const [dr, dc] of jumps) push(r + dr, c + dc);
    }

    if (t === "B") {
      slide(-1,-1); slide(-1,1); slide(1,-1); slide(1,1);
    }

    if (t === "R") {
      slide(-1,0); slide(1,0); slide(0,-1); slide(0,1);
    }

    if (t === "Q") {
      slide(-1,-1); slide(-1,1); slide(1,-1); slide(1,1);
      slide(-1,0); slide(1,0); slide(0,-1); slide(0,1);
    }

    if (t === "K") {
      for (let dr = -1; dr <= 1; dr++) {
        for (let dc = -1; dc <= 1; dc++) {
          if (dr === 0 && dc === 0) continue;
          push(r + dr, c + dc);
        }
      }
      // Castling is handled in legalMoves (needs check + rook unmoved)
    }

    return moves;
  }

  function legalMoves(state, r, c) {
    const board = state.board;
    const piece = board[r][c];
    if (!piece || sideOf(piece) !== state.turn) return [];

    const s = sideOf(piece);
    const t = typeOf(piece);

    // Start with pseudo moves
    let moves = pseudoMoves(board, r, c, piece);

    // Add castling for king (if conditions allow)
    if (t === "K" && !state.moved[`${s}K`]) {
      // squares must be empty, king cannot be in check,
      // king cannot pass through attacked squares.
      const row = s === "w" ? 7 : 0;

      // King side
      if (!state.moved[`${s}R_h`] &&
          board[row][5] === null && board[row][6] === null &&
          !inCheck(board, s) &&
          !isSquareAttacked(board, otherSide(s), row, 5) &&
          !isSquareAttacked(board, otherSide(s), row, 6)) {
        moves.push({ r: row, c: 6, castle: "K" });
      }

      // Queen side
      if (!state.moved[`${s}R_a`] &&
          board[row][1] === null && board[row][2] === null && board[row][3] === null &&
          !inCheck(board, s) &&
          !isSquareAttacked(board, otherSide(s), row, 3) &&
          !isSquareAttacked(board, otherSide(s), row, 2)) {
        moves.push({ r: row, c: 2, castle: "Q" });
      }
    }

    // Filter out moves that leave own king in check
    moves = moves.filter(m => {
      const next = applyMove(cloneState(state), { from: { r, c }, to: { r: m.r, c: m.c }, meta: m }, true);
      return !inCheck(next.board, state.turn);
    });

    return moves;
  }

  const cloneState = (s) => ({
    turn: s.turn,
    board: cloneBoard(s.board),
    moved: { ...s.moved },
    selected: s.selected ? { ...s.selected } : null,
    message: s.message,
  });

  function applyMove(state, move, dryRun = false) {
    const { from, to, meta } = move;
    const piece = state.board[from.r][from.c];
    const s = sideOf(piece);
    const t = typeOf(piece);

    // Mark moved flags
    if (t === "K") state.moved[`${s}K`] = true;
    if (t === "R") {
      if (from.c === 0) state.moved[`${s}R_a`] = true;
      if (from.c === 7) state.moved[`${s}R_h`] = true;
    }

    // Castling: move rook as well
    if (meta && meta.castle && t === "K") {
      const row = s === "w" ? 7 : 0;
      if (meta.castle === "K") {
        // King: e -> g, rook: h -> f
        state.board[row][6] = piece;
        state.board[row][4] = null;
        state.board[row][5] = state.board[row][7];
        state.board[row][7] = null;
        state.moved[`${s}K`] = true;
        state.moved[`${s}R_h`] = true;
      } else {
        // Queen side: e -> c, rook: a -> d
        state.board[row][2] = piece;
        state.board[row][4] = null;
        state.board[row][3] = state.board[row][0];
        state.board[row][0] = null;
        state.moved[`${s}K`] = true;
        state.moved[`${s}R_a`] = true;
      }
    } else {
      // Normal move
      state.board[to.r][to.c] = piece;
      state.board[from.r][from.c] = null;
    }

    // Promotion (simple): pawn reaching last rank becomes Queen
    if (t === "P") {
      if (s === "w" && to.r === 0) state.board[to.r][to.c] = "wQ";
      if (s === "b" && to.r === 7) state.board[to.r][to.c] = "bQ";
    }

    // Swap turn
    state.turn = otherSide(state.turn);

    // Message
    if (!dryRun) {
      const check = inCheck(state.board, state.turn);
      state.message = check ? `${state.turn === "w" ? "White" : "Black"} is in check!` : "Steady hands. Steady mind.";
    }

    return state;
  }

  // --- UI mount -------------------------------------------------------------
  function mount(root) {
    root.innerHTML = "";

    const head = el("div", { class: "po-arcade-head" }, [
      el("div", { class: "po-arcade-title", text: "Chess" }),
      el("div", { class: "po-arcade-subtitle", text: "Aegean Chess — strategy over storms." }),
    ]);

    const restored = load();
    let state = restored && restored.board
      ? restored
      : {
          turn: "w",
          board: cloneBoard(START),
          moved: { wK:false, bK:false, wR_a:false, wR_h:false, bR_a:false, bR_h:false },
          selected: null,
          message: "White to move. Begin the voyage.",
        };

    const status = el("div", { class: "po-arcade-status", text: state.message });

    const resetBtn = el("button", {
      class: "po-arcade-btn",
      type: "button",
      onclick: () => {
        state = {
          turn: "w",
          board: cloneBoard(START),
          moved: { wK:false, bK:false, wR_a:false, wR_h:false, bR_a:false, bR_h:false },
          selected: null,
          message: "White to move. Begin the voyage.",
        };
        persist();
        render();
      },
    }, [document.createTextNode("Reset")]);

    const clearBtn = el("button", {
      class: "po-arcade-btn po-arcade-btn-ghost",
      type: "button",
      onclick: () => { clearSave(); status.textContent = "Save cleared."; },
    }, [document.createTextNode("Clear Save")]);

    const controls = el("div", { class: "po-arcade-controls" }, [resetBtn, clearBtn]);

    const boardEl = el("div", { class: "po-ch-board", role: "grid", "aria-label": "Chess board" });

    root.append(head, controls, status, boardEl);

    const squares = [];
    for (let r = 0; r < 8; r++) {
      for (let c = 0; c < 8; c++) {
        const sq = el("button", {
          class: "po-ch-square",
          type: "button",
          role: "gridcell",
          "aria-label": `Square ${String.fromCharCode(65 + c)}${8 - r}`,
          onclick: () => onSquare(r, c),
        });
        squares.push(sq);
        boardEl.appendChild(sq);
      }
    }

    function persist() {
      save(state);
    }

    function onSquare(r, c) {
      const piece = state.board[r][c];

      // If nothing selected, select own piece
      if (!state.selected) {
        if (piece && sideOf(piece) === state.turn) {
          state.selected = { r, c };
          state.message = `${state.turn === "w" ? "White" : "Black"} selects a piece.`;
          status.textContent = state.message;
          persist();
          render();
        }
        return;
      }

      const from = state.selected;
      const legal = legalMoves(state, from.r, from.c);
      const chosen = legal.find(m => m.r === r && m.c === c);

      // Click same square to unselect
      if (from.r === r && from.c === c) {
        state.selected = null;
        state.message = "Selection cleared.";
        status.textContent = state.message;
        persist();
        render();
        return;
      }

      // If clicked another own piece, switch selection
      if (piece && sideOf(piece) === state.turn && !chosen) {
        state.selected = { r, c };
        state.message = "Switched selection.";
        status.textContent = state.message;
        persist();
        render();
        return;
      }

      // If chosen move is legal, apply it
      if (chosen) {
        state = applyMove(state, { from, to: { r, c }, meta: chosen }, false);
        state.selected = null;

        // Checkmate / stalemate (basic): if current side has no legal moves
        const hasAnyMoves = () => {
          for (let rr = 0; rr < 8; rr++) {
            for (let cc = 0; cc < 8; cc++) {
              const p = state.board[rr][cc];
              if (p && sideOf(p) === state.turn) {
                if (legalMoves(state, rr, cc).length) return true;
              }
            }
          }
          return false;
        };

        if (!hasAnyMoves()) {
          if (inCheck(state.board, state.turn)) {
            state.message = `${state.turn === "w" ? "White" : "Black"} is checkmated. Voyage ends.`;
          } else {
            state.message = "Stalemate — the sea goes silent.";
          }
        }

        status.textContent = state.message;
        persist();
        render();
      }
    }

    function render() {
      // Highlight legal moves if selected
      const legalSet = new Set();
      if (state.selected) {
        const legal = legalMoves(state, state.selected.r, state.selected.c);
        for (const m of legal) legalSet.add(`${m.r},${m.c}`);
      }

      for (let r = 0; r < 8; r++) {
        for (let c = 0; c < 8; c++) {
          const sq = squares[r * 8 + c];
          const piece = state.board[r][c];

          sq.className = "po-ch-square";
          sq.classList.add((r + c) % 2 === 0 ? "is-light" : "is-dark");

          if (state.selected && state.selected.r === r && state.selected.c === c) {
            sq.classList.add("is-selected");
          }
          if (legalSet.has(`${r},${c}`)) sq.classList.add("is-legal");

          sq.textContent = piece ? PIECE_ICON[piece] : "";
        }
      }
    }

    render();
  }

  // --- Register game --------------------------------------------------------
  window.PO_ARCADE_GAMES = window.PO_ARCADE_GAMES || [];
  window.PO_ARCADE_GAMES.push({
    id: GAME_ID,
    title: "Chess",
    subtitle: "Aegean strategy.",
    icon: "♟️",
    mount,
  });
})();
