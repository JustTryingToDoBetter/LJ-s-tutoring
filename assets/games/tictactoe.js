/* ============================================================================
  Project Odysseus Arcade — Tic Tac Toe [UPGRADED]
  - Boards: 3x3 (classic) + 4x4 ("Storm Grid")
  - Modes: vs Friend, vs Cyclops (seeded personality per day)
  - AI:
      * 3x3: minimax
      * 4x4: depth-limited negamax + heuristic
  - Persistence + lifecycle cleanup
============================================================================ */

(() => {
  "use strict";

  const GAME_ID = "tictactoe";
  const STORAGE_KEY = "po_arcade_tictactoe_v2";

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

  const load = () => { try { return JSON.parse(localStorage.getItem(STORAGE_KEY) || "null"); } catch { return null; } };
  const save = (s) => { try { localStorage.setItem(STORAGE_KEY, JSON.stringify(s)); } catch {} };
  const clearSave = () => { try { localStorage.removeItem(STORAGE_KEY); } catch {} };

  function makeLifecycleSignal(root) {
    const ac = new AbortController();
    const tick = () => {
      if (!root.isConnected) { try { ac.abort(); } catch {} return; }
      requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
    return ac.signal;
  }

  function dayKeyLocal() {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,"0")}-${String(d.getDate()).padStart(2,"0")}`;
  }
  function hashSeed(str) {
    let h = 2166136261 >>> 0;
    for (let i = 0; i < str.length; i++) { h ^= str.charCodeAt(i); h = Math.imul(h, 16777619); }
    return h >>> 0;
  }
  function seededRng(seed) {
    let a = seed >>> 0;
    return () => {
      a |= 0; a = (a + 0x6D2B79F5) | 0;
      let t = Math.imul(a ^ (a >>> 15), 1 | a);
      t ^= t + Math.imul(t ^ (t >>> 7), 61 | t);
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  function makeLines(n, winLen) {
    const lines = [];
    // rows
    for (let r = 0; r < n; r++) for (let c = 0; c <= n - winLen; c++) {
      const L = [];
      for (let k = 0; k < winLen; k++) L.push(r*n + (c+k));
      lines.push(L);
    }
    // cols
    for (let c = 0; c < n; c++) for (let r = 0; r <= n - winLen; r++) {
      const L = [];
      for (let k = 0; k < winLen; k++) L.push((r+k)*n + c);
      lines.push(L);
    }
    // diags \
    for (let r = 0; r <= n - winLen; r++) for (let c = 0; c <= n - winLen; c++) {
      const L = [];
      for (let k = 0; k < winLen; k++) L.push((r+k)*n + (c+k));
      lines.push(L);
    }
    // diags /
    for (let r = 0; r <= n - winLen; r++) for (let c = winLen - 1; c < n; c++) {
      const L = [];
      for (let k = 0; k < winLen; k++) L.push((r+k)*n + (c-k));
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
    if (isAiTurn) {
      let best = moves[0];
      for (const m of moves) if (m.score > best.score) best = m;
      return best;
    } else {
      let best = moves[0];
      for (const m of moves) if (m.score < best.score) best = m;
      return best;
    }
  }

  // 4x4 AI: negamax + heuristic
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
    const rng = seededRng(hashSeed("po-cyclops-" + dayKeyLocal()));
    const x = rng();
    if (x < 0.33) return { name: "Aggressive", bias: "attack", depth4: 5 };
    if (x < 0.66) return { name: "Defensive", bias: "block", depth4: 6 };
    return { name: "Balanced", bias: "mix", depth4: 5 };
  }

  function mount(root) {
    root.innerHTML = "";
    const signal = makeLifecycleSignal(root);

    const personality = cyclopsPersonality();

    const restored = load();
    const state = restored?.v === 2 ? restored : {
      v: 2,
      mode: "ai",          // ai | friend
      size: 3,             // 3 | 4
      winLen: 3,           // 3 or 4
      board: Array(9).fill(null),
      turn: "X",
      status: "Your move, Navigator.",
      lastKey: dayKeyLocal(),
    };

    const head = el("div", { class: "po-arcade-head" }, [
      el("div", { class: "po-arcade-title", text: "Tic Tac Toe" }),
      el("div", { class: "po-arcade-subtitle", text: `Cyclops AI — ${personality.name} today.` }),
    ]);

    const status = el("div", { class: "po-arcade-status", text: state.status });

    const modeSelect = el("select", {
      class: "po-arcade-select",
      "aria-label": "Select game mode",
    }, [
      el("option", { value: "ai", text: "Vs Cyclops (AI)" }),
      el("option", { value: "friend", text: "Vs Friend (Local)" }),
    ]);
    modeSelect.value = state.mode;

    const sizeSelect = el("select", { class: "po-arcade-select", "aria-label": "Select board size" }, [
      el("option", { value: "3", text: "3×3 Classic" }),
      el("option", { value: "4", text: "4×4 Storm Grid" }),
    ]);
    sizeSelect.value = String(state.size);

    const resetBtn = el("button", { class: "po-arcade-btn", type: "button" }, ["Reset"]);
    const clearBtn = el("button", { class: "po-arcade-btn po-arcade-btn-ghost", type: "button" }, ["Clear Save"]);

    const controls = el("div", { class: "po-arcade-controls" }, [
      el("div", { class: "po-arcade-control" }, [el("span", { class: "po-arcade-label", text: "Mode" }), modeSelect]),
      el("div", { class: "po-arcade-control" }, [el("span", { class: "po-arcade-label", text: "Board" }), sizeSelect]),
      resetBtn, clearBtn,
    ]);

    const grid = el("div", { class: "po-ttt-grid", role: "grid", "aria-label": "Tic Tac Toe board" });
    root.append(head, controls, status, grid);

    function specFromSize(sz) {
      if (sz === 4) return { size: 4, winLen: 4 };
      return { size: 3, winLen: 3 };
    }

    function persist() { save(state); }

    function rebuildGrid() {
      grid.innerHTML = "";
      const size = state.size;
      grid.style.gridTemplateColumns = `repeat(${size}, 1fr)`;

      const lines = makeLines(size, state.winLen);

      for (let i = 0; i < size * size; i++) {
        const btn = el("button", {
          class: "po-ttt-cell",
          type: "button",
          role: "gridcell",
          "aria-label": `Cell ${i + 1}`,
        });
        btn.addEventListener("click", () => move(i, lines), { signal });
        grid.appendChild(btn);
      }
      render(lines);
    }

    function render(lines) {
      const cells = Array.from(grid.querySelectorAll("button"));
      const out = winnerOf(state.board, lines);
      for (let i = 0; i < cells.length; i++) {
        cells[i].textContent = state.board[i] || "";
        cells[i].disabled = Boolean(state.board[i]) || Boolean(out);
      }
    }

    function endIfNeeded(lines) {
      const out = winnerOf(state.board, lines);
      if (!out) return false;

      if (out === "draw") state.status = "A stalemate at sea. Try again.";
      else if (out === "X") state.status = state.mode === "ai" ? "Victory! The Cyclops falls." : "Player X conquers.";
      else state.status = state.mode === "ai" ? "Defeat… the Cyclops laughs." : "Player O conquers.";

      status.textContent = state.status;
      render(lines);
      persist();
      return true;
    }

    function cyclopsMove(lines) {
      if (winnerOf(state.board, lines)) return;

      if (state.size === 3) {
        const best = minimax3(state.board, lines, true, 0);
        if (typeof best.idx === "number") state.board[best.idx] = "O";
      } else {
        const depth = personality.depth4;
        const b = state.board.slice();
        const best = negamax(b, lines, depth, -Infinity, Infinity, "O", "O", "X");

        let pick = best.idx;
        if (pick == null) {
          const empties = [];
          for (let i = 0; i < state.board.length; i++) if (!state.board[i]) empties.push(i);
          pick = empties[0];
        }
        state.board[pick] = "O";
      }

      state.turn = "X";
      state.status = "Your move, Navigator.";
      status.textContent = state.status;
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
      status.textContent = state.status;
      rebuildGrid();
      persist();
    }

    function move(i, lines) {
      if (state.board[i] || winnerOf(state.board, lines)) return;

      state.board[i] = state.turn;

      if (state.mode === "friend") {
        state.turn = state.turn === "X" ? "O" : "X";
        state.status = `Player ${state.turn}'s move.`;
        status.textContent = state.status;
        render(lines);
        persist();
        endIfNeeded(lines);
        return;
      }

      state.turn = "O";
      state.status = "The Cyclops considers…";
      status.textContent = state.status;
      render(lines);
      persist();

      if (endIfNeeded(lines)) return;
      setTimeout(() => cyclopsMove(lines), 160);
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
        setTimeout(() => cyclopsMove(lines), 160);
      }
    }
  }

  window.PO_ARCADE_GAMES = window.PO_ARCADE_GAMES || [];
  window.PO_ARCADE_GAMES.push({
    id: GAME_ID,
    title: "Tic Tac Toe",
    subtitle: "Cyclops AI variants.",
    icon: "🧿",
    mount,
  });
})();