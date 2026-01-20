/* ============================================================================
  Project Odysseus Arcade — Tic Tac Toe
  - Modes: vs Friend, vs Cyclops AI (minimax + depth preference)
  - Saves: current board + turn + mode
  - Accessibility: buttons with aria-labels, keyboard navigation
============================================================================ */

(() => {
  "use strict";

  const GAME_ID = "tictactoe";
  const STORAGE_KEY = "po_arcade_tictactoe_v1";

  // --- Small helpers --------------------------------------------------------
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
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      return raw ? JSON.parse(raw) : null;
    } catch {
      return null;
    }
  };

  const save = (state) => {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
    } catch {
      // storage might be blocked; game still works without persistence
    }
  };

  const clearSave = () => {
    try { localStorage.removeItem(STORAGE_KEY); } catch {}
  };

  // --- Game logic -----------------------------------------------------------
  const LINES = [
    [0,1,2],[3,4,5],[6,7,8], // rows
    [0,3,6],[1,4,7],[2,5,8], // cols
    [0,4,8],[2,4,6],         // diags
  ];

  const winnerOf = (b) => {
    for (const [a,c,d] of LINES) {
      if (b[a] && b[a] === b[c] && b[a] === b[d]) return b[a];
    }
    return b.every(Boolean) ? "draw" : null;
  };

  // Minimax AI: X is human by default, O is AI in AI mode.
  // We score: win for AI -> +10, win for human -> -10, draw -> 0.
  // Depth is subtracted to prefer faster wins and slower losses.
  const minimax = (board, isAiTurn, depth) => {
    const outcome = winnerOf(board);
    if (outcome) {
      if (outcome === "O") return { score: 10 - depth };
      if (outcome === "X") return { score: depth - 10 };
      return { score: 0 };
    }

    const moves = [];
    for (let i = 0; i < 9; i++) {
      if (board[i]) continue;
      const next = board.slice();
      next[i] = isAiTurn ? "O" : "X";
      const res = minimax(next, !isAiTurn, depth + 1);
      moves.push({ idx: i, score: res.score });
    }

    // AI maximizes, human minimizes
    if (isAiTurn) {
      let best = moves[0];
      for (const m of moves) if (m.score > best.score) best = m;
      return best;
    } else {
      let best = moves[0];
      for (const m of moves) if (m.score < best.score) best = m;
      return best;
    }
  };

  // --- UI mount -------------------------------------------------------------
  function mount(root) {
    root.innerHTML = "";

    // Default state (or restored)
    const restored = load();
    const state = restored && restored.board ? restored : {
      mode: "ai",               // "ai" | "friend"
      board: Array(9).fill(null),
      turn: "X",
      status: "Your move, Navigator.",
    };

    const title = el("div", { class: "po-arcade-head" }, [
      el("div", { class: "po-arcade-title", text: "Tic Tac Toe" }),
      el("div", { class: "po-arcade-subtitle", text: "Outwit the Cyclops. Claim the grid." }),
    ]);

    const status = el("div", { class: "po-arcade-status", text: state.status });

    const modeSelect = el("select", {
      class: "po-arcade-select",
      "aria-label": "Select game mode",
      onchange: (e) => {
        state.mode = e.target.value;
        state.board = Array(9).fill(null);
        state.turn = "X";
        state.status = state.mode === "ai"
          ? "Your move, Navigator."
          : "Player X begins the voyage.";
        status.textContent = state.status;
        renderBoard();
        save(state);
      },
    }, [
      el("option", { value: "ai", text: "Vs Cyclops (AI)" }),
      el("option", { value: "friend", text: "Vs Friend (Local)" }),
    ]);
    modeSelect.value = state.mode;

    const controls = el("div", { class: "po-arcade-controls" }, [
      el("div", { class: "po-arcade-control" }, [
        el("span", { class: "po-arcade-label", text: "Mode" }),
        modeSelect,
      ]),
      el("button", {
        class: "po-arcade-btn",
        type: "button",
        onclick: () => {
          state.board = Array(9).fill(null);
          state.turn = "X";
          state.status = state.mode === "ai" ? "Your move, Navigator." : "Player X begins the voyage.";
          status.textContent = state.status;
          renderBoard();
          save(state);
        },
      }, [document.createTextNode("Reset")]),
      el("button", {
        class: "po-arcade-btn po-arcade-btn-ghost",
        type: "button",
        onclick: () => {
          clearSave();
          state.mode = "ai";
          state.board = Array(9).fill(null);
          state.turn = "X";
          state.status = "Your move, Navigator.";
          modeSelect.value = state.mode;
          status.textContent = state.status;
          renderBoard();
        },
      }, [document.createTextNode("Clear Save")]),
    ]);

    const grid = el("div", { class: "po-ttt-grid", role: "grid", "aria-label": "Tic Tac Toe board" });

    const cells = Array.from({ length: 9 }, (_, i) =>
      el("button", {
        class: "po-ttt-cell",
        type: "button",
        role: "gridcell",
        "aria-label": `Cell ${i + 1}`,
        onclick: () => move(i),
      })
    );

    cells.forEach((c) => grid.appendChild(c));

    root.append(title, controls, status, grid);

    const renderBoard = () => {
      for (let i = 0; i < 9; i++) {
        cells[i].textContent = state.board[i] || "";
        cells[i].disabled = Boolean(state.board[i]) || Boolean(winnerOf(state.board));
      }
    };

    const endIfNeeded = () => {
      const out = winnerOf(state.board);
      if (!out) return false;

      if (out === "draw") state.status = "A stalemate at sea. Try again.";
      else if (out === "X") state.status = state.mode === "ai" ? "Victory! The Cyclops falls." : "Player X conquers.";
      else state.status = state.mode === "ai" ? "Defeat… the Cyclops laughs." : "Player O conquers.";

      status.textContent = state.status;
      renderBoard();
      save(state);
      return true;
    };

    const aiMove = () => {
      if (winnerOf(state.board)) return;
      const best = minimax(state.board, true, 0);
      if (typeof best.idx === "number") {
        state.board[best.idx] = "O";
        state.turn = "X";
        state.status = "Your move, Navigator.";
        status.textContent = state.status;
        renderBoard();
        save(state);
        endIfNeeded();
      }
    };

    const move = (idx) => {
      if (state.board[idx] || winnerOf(state.board)) return;

      // Place current mark
      state.board[idx] = state.turn;

      // Swap turns
      if (state.mode === "friend") {
        state.turn = state.turn === "X" ? "O" : "X";
        state.status = `Player ${state.turn}'s move.`;
      } else {
        // Human is X, AI is O
        state.turn = "O";
        state.status = "The Cyclops considers…";
      }

      status.textContent = state.status;
      renderBoard();
      save(state);

      // End check
      if (endIfNeeded()) return;

      // AI turn
      if (state.mode === "ai" && state.turn === "O") {
        // Tiny delay for feel (still instant enough)
        setTimeout(aiMove, 180);
      }
    };

    // Restore UI state on load
    renderBoard();
    if (state.mode === "ai" && state.turn === "O" && !winnerOf(state.board)) setTimeout(aiMove, 180);
  }

  // --- Register game --------------------------------------------------------
  window.PO_ARCADE_GAMES = window.PO_ARCADE_GAMES || [];
  window.PO_ARCADE_GAMES.push({
    id: GAME_ID,
    title: "Tic Tac Toe",
    subtitle: "Outwit the Cyclops.",
    icon: "🧿",
    mount,
  });
})();
