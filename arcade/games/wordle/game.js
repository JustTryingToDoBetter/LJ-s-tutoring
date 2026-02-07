import { createConsolePage, lockScroll } from "/assets/arcade/ui/ConsolePage.js";
import { createConsoleRuntime } from "/assets/arcade/console-runtime.js";
import wordle from "/assets/games/wordle.js";

const root = document.getElementById("game-root");
lockScroll();

const page = createConsolePage({
  title: "Oracle Word",
  subtitle: "Wordle",
  onBack: () => (window.location.href = "/arcade/"),
  onRestart: () => window.location.reload(),
  onPause: () => runtime.showSettings(),
  howTo: {
    gameId: "wordle",
    title: "How to play Wordle",
    subtitle: "Guess the five‑letter word in six tries.",
    steps: ["Type a 5‑letter word", "Use the color feedback", "Solve in as few rows as possible"],
    controls: ["On‑screen keyboard", "Enter submits", "⌫ deletes"],
  },
});

root.append(page.root);

const runtime = createConsoleRuntime({
  gameId: "wordle",
  mountEl: page.surfaceInner,
  surfaceEl: page.surface,
  page,
});

await wordle.mount(page.surfaceInner, runtime.ctx);
page.showHowTo();
