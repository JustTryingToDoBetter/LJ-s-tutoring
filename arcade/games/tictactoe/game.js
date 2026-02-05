import { createConsolePage, lockScroll } from "/assets/arcade/ui/ConsolePage.js";
import tictactoe from "/assets/games/tictactoe.js";

const root = document.getElementById("game-root");
lockScroll();

const page = createConsolePage({
  title: "Tic Tac Toe",
  subtitle: "Classic",
  onBack: () => (window.location.href = "/arcade/"),
  onRestart: () => window.location.reload(),
  onPause: () => page.showSettings(),
  howTo: {
    gameId: "tictactoe",
    title: "How to play Tic Tac Toe",
    subtitle: "Align your marks to win.",
    steps: ["Choose mode", "Place marks", "Outsmart the opponent"],
    controls: ["Tap a cell", "Reset anytime"],
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

await tictactoe.mount(page.surfaceInner, ctx);
page.showHowTo();
