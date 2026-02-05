import { createConsolePage, lockScroll } from "/assets/arcade/ui/ConsolePage.js";
import hangman from "/assets/games/hangman.js";

const root = document.getElementById("game-root");
lockScroll();

const page = createConsolePage({
  title: "Gallows of Ithaca",
  subtitle: "Hangman",
  onBack: () => (window.location.href = "/arcade/"),
  onRestart: () => window.location.reload(),
  onPause: () => page.showSettings(),
  howTo: {
    gameId: "hangman",
    title: "How to play Hangman",
    subtitle: "Guess the word before the crew is lost.",
    steps: ["Choose letters", "Avoid too many misses", "Use Reveal once per round"],
    controls: ["Tap letters", "Keyboard A–Z"],
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

await hangman.mount(page.surfaceInner, ctx);
page.showHowTo();
