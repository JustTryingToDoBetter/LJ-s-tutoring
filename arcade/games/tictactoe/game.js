import { createConsolePage, lockScroll } from "/assets/arcade/ui/ConsolePage.js";
import { createConsoleRuntime } from "/assets/arcade/console-runtime.js";
import tictactoe from "/assets/games/tictactoe.js";

const root = document.getElementById("game-root");
lockScroll();

const page = createConsolePage({
  title: "Tic Tac Toe",
  subtitle: "Classic",
  onBack: () => (window.location.href = "/arcade/"),
  onRestart: () => window.location.reload(),
  onPause: () => runtime.showSettings(),
  howTo: {
    gameId: "tictactoe",
    title: "How to play Tic Tac Toe",
    subtitle: "Align your marks to win.",
    steps: ["Choose mode", "Place marks", "Outsmart the opponent"],
    controls: ["Tap a cell", "Reset anytime"],
  },
});

root.append(page.root);

const runtime = createConsoleRuntime({
  gameId: "tictactoe",
  mountEl: page.surfaceInner,
  surfaceEl: page.surface,
  page,
});

await tictactoe.mount(page.surfaceInner, runtime.ctx);
page.showHowTo();
