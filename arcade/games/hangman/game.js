import { createConsolePage, lockScroll } from "/assets/arcade/ui/ConsolePage.js";
import { createConsoleRuntime } from "/assets/arcade/console-runtime.js";
import hangman from "/assets/games/hangman.js";

const root = document.getElementById("game-root");
lockScroll();

const page = createConsolePage({
  title: "Gallows of Ithaca",
  subtitle: "Hangman",
  onBack: () => (window.location.href = "/arcade/"),
  onRestart: () => window.location.reload(),
  onPause: () => runtime.showSettings(),
  howTo: {
    gameId: "hangman",
    title: "How to play Hangman",
    subtitle: "Guess the word before the crew is lost.",
    steps: ["Choose letters", "Avoid too many misses", "Use Reveal once per round"],
    controls: ["Tap letters", "Keyboard A–Z"],
  },
});

root.append(page.root);

const runtime = createConsoleRuntime({
  gameId: "hangman",
  mountEl: page.surfaceInner,
  surfaceEl: page.surface,
  page,
});

await hangman.mount(page.surfaceInner, runtime.ctx);
page.showHowTo();
