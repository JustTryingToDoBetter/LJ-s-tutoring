import { createConsolePage, lockScroll } from "/assets/arcade/ui/ConsolePage.js";
import { createConsoleRuntime } from "/assets/arcade/console-runtime.js";
import minesweeper from "/assets/games/minesweeper.js";

const root = document.getElementById("game-root");
lockScroll();

const page = createConsolePage({
  title: "Minesweeper",
  subtitle: "Field Scan",
  onBack: () => (window.location.href = "/arcade/"),
  onRestart: () => window.location.reload(),
  onPause: () => runtime.showSettings(),
  howTo: {
    gameId: "minesweeper",
    title: "How to play Minesweeper",
    subtitle: "Mark mines and clear the field.",
    steps: ["Reveal safe tiles", "Numbers show adjacent mines", "Flag mines to win"],
    controls: ["Tap to reveal", "Toggle Flag mode to place flags"],
  },
});

root.append(page.root);

const runtime = createConsoleRuntime({
  gameId: "minesweeper",
  mountEl: page.surfaceInner,
  surfaceEl: page.surface,
  page,
});

await minesweeper.init(runtime.ctx);
page.showHowTo();
