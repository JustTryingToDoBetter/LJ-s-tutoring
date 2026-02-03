/* =========================================================
   Quick Math — Odyssey Arcade v1
   Premium, calm, deterministic
   ========================================================= */

export function initGame(container, config = {}) {
  /* ---------- Config ---------- */
  const ROUND_TIME = 60; // seconds
  const STORAGE_KEY = "odyssey_quickmath";

  const difficulty =
    config.difficulty ||
    loadState().lastDifficulty ||
    "normal";

  /* ---------- State ---------- */
  let timeLeft = ROUND_TIME;
  let score = 0;
  let streak = 0;
  let correct = 0;
  let total = 0;
  let currentQuestion = null;
  let input = "";
  let timerId = null;
  let paused = false;

  /* ---------- Layout ---------- */
  container.innerHTML = `
    <div class="qm-frame">
      <header class="qm-hud">
        <span class="qm-title">Quick Math</span>
        <span class="qm-difficulty">${difficulty.toUpperCase()}</span>
        <span class="qm-timer">01:00</span>
      </header>

      <main class="qm-stage">
        <div class="qm-question">—</div>
        <div class="qm-input">0</div>
      </main>

      <footer class="qm-keypad">
        ${[1,2,3,4,5,6,7,8,9].map(n => `<button>${n}</button>`).join("")}
        <button class="qm-back">⌫</button>
        <button>0</button>
        <button class="qm-submit">↵</button>
      </footer>
    </div>
  `;

  /* ---------- Elements ---------- */
  const elQuestion = container.querySelector(".qm-question");
  const elInput = container.querySelector(".qm-input");
  const elTimer = container.querySelector(".qm-timer");
  const keypad = container.querySelector(".qm-keypad");

  if (!elQuestion || !elInput || !elTimer || !keypad) {
    container.innerHTML = "<div class=\"po-arcade__muted\">Quick Math failed to mount.</div>";
    return {
      pause() {},
      resume() {},
      destroy() {},
    };
  }

  /* ---------- Game Flow ---------- */
  nextQuestion();
  startTimer();

  keypad.addEventListener("click", onKeyPress);

  return {
    pause() {
      paused = true;
    },
    resume() {
      paused = false;
    },
    destroy() {
      try {
        clearInterval(timerId);
      } catch {}
      try {
        keypad.removeEventListener("click", onKeyPress);
      } catch {}
    },
  };

  /* ---------- Functions ---------- */

  function startTimer() {
    timerId = setInterval(() => {
      if (paused) return;
      timeLeft--;
      updateTimer();
      if (timeLeft <= 0) endGame();
    }, 1000);
  }

  function updateTimer() {
    const m = String(Math.floor(timeLeft / 60)).padStart(2, "0");
    const s = String(timeLeft % 60).padStart(2, "0");
    elTimer.textContent = `${m}:${s}`;
  }

  function nextQuestion() {
    currentQuestion = generateQuestion(difficulty);
    elQuestion.textContent = currentQuestion.text;
    input = "";
    renderInput();
  }

  function onKeyPress(e) {
    if (!e.target.matches("button")) return;

    if (e.target.classList.contains("qm-submit")) {
      submitAnswer();
      return;
    }

    if (e.target.classList.contains("qm-back")) {
      input = input.slice(0, -1);
      renderInput();
      return;
    }

    if (input.length < 6) {
      input += e.target.textContent;
      renderInput();
    }
  }

  function renderInput() {
    elInput.textContent = input || "0";
  }

  function submitAnswer() {
    if (input === "") return;

    total++;
    const value = Number(input);

    if (value === currentQuestion.answer) {
      correct++;
      streak++;
      score += 10 + Math.min(streak * 2, 10);
    } else {
      streak = 0;
    }

    nextQuestion();
  }

  function endGame() {
    clearInterval(timerId);

    try {
      keypad.removeEventListener("click", onKeyPress);
    } catch {}

    const accuracy = total ? correct / total : 0;
    const finalScore = Math.round(score * accuracyMultiplier(accuracy));

    saveResult(finalScore, accuracy);

    // Best-effort integrate with Arcade state (ctx) if provided.
    try {
      const ctx = config.ctx;
      if (ctx && typeof ctx.getState === "function" && typeof ctx.setState === "function") {
        const state = ctx.getState();
        state.games = state.games && typeof state.games === "object" ? state.games : {};
        state.games.quickmath = state.games.quickmath || { best: 0, last: null };
        state.games.quickmath.best = Math.max(state.games.quickmath.best || 0, finalScore);
        state.games.quickmath.last = {
          score: finalScore,
          accuracy,
          difficulty,
          at: Date.now(),
        };
        ctx.setState(state);
      }
      config.ctx?.onQuestComplete?.({ gameId: "quickmath", points: finalScore });
    } catch {}

    container.innerHTML = `
      <div class="qm-results">
        <h2>Round Complete</h2>
        <p class="qm-score">${finalScore}</p>
        <p>Accuracy: ${(accuracy * 100).toFixed(1)}%</p>

        <div class="qm-actions">
          <button class="qm-replay">Play Again</button>
          <button class="qm-exit">Exit</button>
        </div>
      </div>
    `;

    container.querySelector(".qm-replay").onclick = () =>
      initGame(container, { difficulty });

    container.querySelector(".qm-exit").onclick = () =>
      config.onExit && config.onExit();
  }

  /* ---------- Helpers ---------- */

  function generateQuestion(level) {
    let ops, max;

    if (level === "easy") {
      ops = ["+"];
      max = 10;
    } else if (level === "normal") {
      ops = ["+", "-"];
      max = 25;
    } else {
      ops = ["+", "-", "×", "÷"];
      max = 50;
    }

    let a, b, op, answer;

    do {
      a = rand(1, max);
      b = rand(1, max);
      op = ops[Math.floor(Math.random() * ops.length)];

      if (op === "+") answer = a + b;
      if (op === "-") answer = a - b;
      if (op === "×") answer = a * b;
      if (op === "÷") {
        answer = a / b;
      }
    } while (op === "÷" && (!Number.isInteger(answer)));

    return {
      text: `${a} ${op} ${b}`,
      answer
    };
  }

  function accuracyMultiplier(a) {
    if (a >= 0.95) return 1.15;
    if (a >= 0.85) return 1.05;
    return 1;
  }

  function rand(min, max) {
    return Math.floor(Math.random() * (max - min + 1)) + min;
  }

  function loadState() {
    try {
      return JSON.parse(localStorage.getItem(STORAGE_KEY)) || {};
    } catch {
      return {};
    }
  }

  function saveResult(score, accuracy) {
    const today = new Date().toDateString();
    const state = loadState();

    if (state.date !== today) {
      state.bestToday = 0;
      state.date = today;
    }

    state.bestToday = Math.max(state.bestToday || 0, score);
    state.bestAllTime = Math.max(state.bestAllTime || 0, score);
    state.lastDifficulty = difficulty;

    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));

    // Keep the arcade home "best today" chip in sync.
    // Canonical key is defined in assets/arcade.js (LS.bestToday).
    try {
      localStorage.setItem("po_arcade_best_today", String(state.bestToday));
    } catch {}
  }
}

// Arcade loader compatibility: legacy named export.
export function mountQuickMath(root, ctx) {
  return initGame(root, {
    ctx,
    onExit: () => {
      try {
        window.location.assign("/arcade/");
      } catch {}
    },
  });
}

// Preferred: lifecycle default export.
export default {
  _game: null,
  async mount(root, ctx) {
    this._game = mountQuickMath(root, ctx);
  },
  pause() {
    this._game?.pause?.();
  },
  resume() {
    this._game?.resume?.();
  },
  destroy() {
    this._game?.destroy?.();
    this._game = null;
  },
};
