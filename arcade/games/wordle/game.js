import { createConsolePage, lockScroll } from "/assets/arcade/ui/ConsolePage.js";
import wordle from "/assets/games/wordle.js";

const root = document.getElementById("game-root");
lockScroll();

const page = createConsolePage({
  title: "Oracle Word",
  subtitle: "Wordle",
  onBack: () => (window.location.href = "/arcade/"),
  onRestart: () => window.location.reload(),
  onPause: () => page.showSettings(),
  howTo: {
    gameId: "wordle",
    title: "How to play Wordle",
    subtitle: "Guess the five‑letter word in six tries.",
    steps: ["Type a 5‑letter word", "Use the color feedback", "Solve in as few rows as possible"],
    controls: ["On‑screen keyboard", "Enter submits", "⌫ deletes"],
  },
});

root.append(page.root);

const ctx = {
  ui: {
    setHUD: (chips) => page.setHUD(chips),
    setControls: (node) => page.setControls(node),
    setStatus: (text) => page.setStatus(text),
  },
};

await wordle.mount(page.surfaceInner, ctx);
page.showHowTo();
