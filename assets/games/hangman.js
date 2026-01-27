/* Hangman (upgraded) — Gallows of Ithaca
   - Words loaded from /arcade/packs/hangman-words.json
   - Deterministic daily word (same on device/day)
   - Dynamic difficulty: maxWrong scales with word length + mode
*/
(() => {
  "use strict";

  const GAME_ID = "hangman";
  const STORAGE_KEY = "po_arcade_hangman_v2";
  const PACK_URL = "/arcade/packs/hangman-words.json";

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

  async function loadPack() {
    // network -> localStorage cache
    const cacheKey = "po_pack_hangman_v1";
    try {
      const res = await fetch(PACK_URL, { cache: "no-cache" });
      if (res.ok) {
        const data = await res.json();
        try { localStorage.setItem(cacheKey, JSON.stringify({ at: Date.now(), data })); } catch {}
        return data;
      }
    } catch {}
    try {
      const raw = localStorage.getItem(cacheKey);
      const parsed = raw ? JSON.parse(raw) : null;
      if (parsed?.data) return parsed.data;
    } catch {}
    throw new Error("Pack missing");
  }

  function normalizeEntries(pack) {
    const entries = Array.isArray(pack?.entries) ? pack.entries : [];
    return entries
      .map(x => ({ w: String(x.w || "").toUpperCase().replace(/[^A-Z]/g, ""), hint: String(x.hint || "") }))
      .filter(x => x.w.length >= 4);
  }

  function maxWrongFor(word, mode) {
    // longer words get a little more slack; “daily” is slightly tighter
    const base = 5 + Math.min(3, Math.floor(word.length / 4));
    return mode === "daily" ? Math.max(5, base - 1) : base;
  }

  function newGameState(entries, mode) {
    const key = dayKeyLocal();
    const rng = seededRng(hashSeed(`po-hangman-${mode}-${key}`));
    const pick = entries[Math.floor(rng() * entries.length)];
    return {
      mode,
      day: key,
      word: pick.w,
      hint: pick.hint,
      guessed: [],
      wrong: 0,
      maxWrong: maxWrongFor(pick.w, mode),
      revealUsed: false, // one “reveal a letter” power-up
      done: false,
      won: false,
    };
  }

  function mount(root) {
    root.innerHTML = "";

    const head = el("div", { class: "po-arcade-head" }, [
      el("div", { class: "po-arcade-title", text: "Hangman" }),
      el("div", { class: "po-arcade-subtitle", text: "Save the crew. Generated voyages." }),
    ]);

    const status = el("div", { class: "po-arcade-status" }, ["Loading word pack…"]);
    root.append(head, status);

    (async () => {
      let entries;
      try {
        entries = normalizeEntries(await loadPack());
      } catch {
        status.textContent = `Word pack missing: ${PACK_URL}`;
        return;
      }
      if (!entries.length) { status.textContent = "Hangman pack has no valid entries."; return; }

      const restored = load();
      const today = dayKeyLocal();

      let state =
        restored && restored.word && restored.day === today
          ? restored
          : newGameState(entries, "daily");

      const hint = el("div", { class: "po-arcade-hint" });
      const mistakes = el("div", { class: "po-arcade-mistakes" });
      const wordRow = el("div", { class: "po-hm-word", "aria-label": "Current word" });
      const letters = el("div", { class: "po-hm-letters", role: "group", "aria-label": "Letter buttons" });

      const modeSelect = el("select", {
        class: "po-arcade-select",
        "aria-label": "Select hangman mode",
        onchange: () => {
          state = newGameState(entries, modeSelect.value);
          save(state);
          render();
        },
      }, [
        el("option", { value: "daily", text: "Daily Word" }),
        el("option", { value: "endless", text: "Endless" }),
      ]);
      modeSelect.value = state.mode || "daily";

      const newBtn = el("button", {
        class: "po-arcade-btn",
        type: "button",
        onclick: () => {
          state = newGameState(entries, state.mode || "daily");
          save(state);
          render();
        },
      }, [document.createTextNode("New Word")]);

      const revealBtn = el("button", {
        class: "po-arcade-btn",
        type: "button",
        onclick: () => {
          if (state.done || state.revealUsed) return;
          state.revealUsed = true;
          // reveal one unguessed letter
          const hidden = state.word.split("").filter(ch => !state.guessed.includes(ch));
          if (hidden.length) state.guessed.push(hidden[0]);
          save(state);
          render();
        },
      }, [document.createTextNode("Reveal (1x)")]);

      const clearBtn = el("button", {
        class: "po-arcade-btn po-arcade-btn-ghost",
        type: "button",
        onclick: () => { clearSave(); status.textContent = "Save cleared."; },
      }, [document.createTextNode("Clear Save")]);

      const controls = el("div", { class: "po-arcade-controls" }, [
        el("div", { class: "po-arcade-control" }, [ el("span", { class: "po-arcade-label", text: "Mode" }), modeSelect ]),
        newBtn, revealBtn, clearBtn,
      ]);

      root.innerHTML = "";
      root.append(head, controls, hint, status, mistakes, wordRow, letters);

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

      const onKeyDown = (e) => {
        const key = (e.key || "").toUpperCase();
        if (key.length === 1 && key >= "A" && key <= "Z") guess(key);
      };
      window.addEventListener("keydown", onKeyDown);

      function computeMasked() {
        const set = new Set(state.guessed);
        return state.word.split("").map(ch => (set.has(ch) ? ch : "•")).join(" ");
      }

      function guess(ch) {
        if (state.done) return;
        if (state.guessed.includes(ch)) return;

        state.guessed.push(ch);
        if (!state.word.includes(ch)) state.wrong += 1;

        const allRevealed = state.word.split("").every(c => state.guessed.includes(c));
        if (allRevealed) { state.done = true; state.won = true; }
        if (state.wrong >= state.maxWrong) { state.done = true; state.won = false; }

        save(state);
        render();
      }

      function render() {
        hint.textContent = state.hint ? `Hint: ${state.hint}` : "Hint: (none)";
        mistakes.textContent = `Storm damage: ${state.wrong}/${state.maxWrong}`;
        wordRow.textContent = computeMasked();

        revealBtn.disabled = state.revealUsed || state.done;

        for (const [ch, btn] of Object.entries(buttons)) {
          const used = state.guessed.includes(ch);
          btn.disabled = used || state.done;
          btn.classList.toggle("is-used", used);
          btn.classList.toggle("is-wrong", used && !state.word.includes(ch));
          btn.classList.toggle("is-right", used && state.word.includes(ch));
        }

        if (!state.done) status.textContent = "Choose wisely, Navigator.";
        else if (state.won) status.textContent = "Victory — the crew survives!";
        else status.textContent = `Lost at sea… The word was ${state.word}.`;
      }

      render();
    })();
  }

  window.PO_ARCADE_GAMES = window.PO_ARCADE_GAMES || [];
  window.PO_ARCADE_GAMES.push({ id: GAME_ID, title: "Hangman", subtitle: "Generated voyages.", icon: "🪢", mount });
})();