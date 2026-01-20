/* ============================================================================
  Project Odysseus Arcade — Hangman ("Gallows of Ithaca")
  - Odyssey-themed word bank + hint
  - Keyboard input + on-screen letters
  - Saves: current word, guesses, mistakes
============================================================================ */

(() => {
  "use strict";

  const GAME_ID = "hangman";
  const STORAGE_KEY = "po_arcade_hangman_v1";

  // --- Odyssey word bank (edit freely) --------------------------------------
  // Keep words uppercase A-Z only for predictable keyboard handling.
  const WORDS = [
    { w: "ODYSSEY", hint: "A long voyage home." },
    { w: "ITHACA", hint: "The home you return to." },
    { w: "NAVIGATOR", hint: "One who charts the course." },
    { w: "TRIREME", hint: "Ancient Greek warship." },
    { w: "SIRENS", hint: "Voices that lure sailors." },
    { w: "CYCLOPS", hint: "One-eyed giant." },
    { w: "AEOLUS", hint: "Keeper of the winds." },
    { w: "POSEIDON", hint: "God of the sea." },
    { w: "TELEMACHUS", hint: "Odysseus’ son." },
    { w: "PENELOPE", hint: "Odysseus’ wife." },
    { w: "ANCHOR", hint: "Stops a ship from drifting." },
    { w: "COMPASS", hint: "Points the way." },
    { w: "STORM", hint: "Sea’s fury." },
    { w: "HARBOR", hint: "Safe water near land." },
  ];

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

  const randInt = (n) => Math.floor(Math.random() * n);

  const load = () => {
    try { return JSON.parse(localStorage.getItem(STORAGE_KEY) || "null"); } catch { return null; }
  };
  const save = (s) => { try { localStorage.setItem(STORAGE_KEY, JSON.stringify(s)); } catch {} };
  const clearSave = () => { try { localStorage.removeItem(STORAGE_KEY); } catch {} };

  // --- UI mount -------------------------------------------------------------
  function mount(root) {
    root.innerHTML = "";

    const restored = load();
    let state = restored && restored.word ? restored : newGameState();

    const head = el("div", { class: "po-arcade-head" }, [
      el("div", { class: "po-arcade-title", text: "Hangman" }),
      el("div", { class: "po-arcade-subtitle", text: "Save the crew. Guess the word." }),
    ]);

    const hint = el("div", { class: "po-arcade-hint" });
    const status = el("div", { class: "po-arcade-status" });

    const mistakes = el("div", { class: "po-arcade-mistakes" });
    const wordRow = el("div", { class: "po-hm-word", "aria-label": "Current word" });

    const letters = el("div", { class: "po-hm-letters", role: "group", "aria-label": "Letter buttons" });

    const resetBtn = el("button", {
      class: "po-arcade-btn",
      type: "button",
      onclick: () => {
        state = newGameState();
        save(state);
        render();
      },
    }, [document.createTextNode("New Word")]);

    const clearBtn = el("button", {
      class: "po-arcade-btn po-arcade-btn-ghost",
      type: "button",
      onclick: () => { clearSave(); state = newGameState(); render(); },
    }, [document.createTextNode("Clear Save")]);

    const controls = el("div", { class: "po-arcade-controls" }, [
      resetBtn,
      clearBtn,
    ]);

    root.append(head, controls, hint, status, mistakes, wordRow, letters);

    // Build letter buttons A-Z once
    const buttons = {};
    for (let i = 65; i <= 90; i++) {
      const ch = String.fromCharCode(i);
      const btn = el("button", {
        class: "po-hm-letter",
        type: "button",
        "aria-label": `Guess letter ${ch}`,
        onclick: () => guess(ch),
      }, [document.createTextNode(ch)]);
      buttons[ch] = btn;
      letters.appendChild(btn);
    }

    // Keyboard input (only while mounted)
    const onKeyDown = (e) => {
      const key = (e.key || "").toUpperCase();
      if (key.length === 1 && key >= "A" && key <= "Z") guess(key);
    };
    window.addEventListener("keydown", onKeyDown);

    // Ensure cleanup if your arcade swaps games by replacing DOM:
    // (If you implement unmount hooks later, remove this listener there.)
    // For now, it’s acceptable; only one arcade page is active.

    function newGameState() {
      const pick = WORDS[randInt(WORDS.length)];
      return {
        word: pick.w,
        hint: pick.hint,
        guessed: [],     // letters guessed
        wrong: 0,
        maxWrong: 6,
        done: false,
        won: false,
      };
    }

    function computeMasked() {
      const set = new Set(state.guessed);
      return state.word.split("").map(ch => (set.has(ch) ? ch : "•")).join(" ");
    }

    function guess(ch) {
      if (state.done) return;
      if (state.guessed.includes(ch)) return;

      state.guessed.push(ch);

      if (!state.word.includes(ch)) state.wrong += 1;

      // Win check
      const allRevealed = state.word.split("").every(c => state.guessed.includes(c));
      if (allRevealed) {
        state.done = true;
        state.won = true;
      }

      // Lose check
      if (state.wrong >= state.maxWrong) {
        state.done = true;
        state.won = false;
      }

      save(state);
      render();
    }

    function render() {
      hint.textContent = `Hint: ${state.hint}`;
      mistakes.textContent = `Storm damage: ${state.wrong}/${state.maxWrong}`;

      wordRow.textContent = computeMasked();

      // Button states
      for (const [ch, btn] of Object.entries(buttons)) {
        const used = state.guessed.includes(ch);
        btn.disabled = used || state.done;
        btn.classList.toggle("is-used", used);
        btn.classList.toggle("is-wrong", used && !state.word.includes(ch));
        btn.classList.toggle("is-right", used && state.word.includes(ch));
      }

      if (!state.done) {
        status.textContent = "Choose wisely, Navigator.";
      } else if (state.won) {
        status.textContent = "Victory — the crew survives!";
      } else {
        status.textContent = `Lost at sea… The word was ${state.word}.`;
      }
    }

    render();
  }

  // --- Register game --------------------------------------------------------
  window.PO_ARCADE_GAMES = window.PO_ARCADE_GAMES || [];
  window.PO_ARCADE_GAMES.push({
    id: GAME_ID,
    title: "Hangman",
    subtitle: "Save the crew.",
    icon: "🪢",
    mount,
  });
})();
