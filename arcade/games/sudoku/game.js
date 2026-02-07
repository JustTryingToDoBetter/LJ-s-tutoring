import { createConsolePage, lockScroll } from "/assets/arcade/ui/ConsolePage.js";
import { createConsoleRuntime } from "/assets/arcade/console-runtime.js";

const root = document.getElementById("game-root");
lockScroll();

const page = createConsolePage({
  title: "The Nine Seas",
  subtitle: "Sudoku",
  onBack: () => (window.location.href = "/arcade/"),
  onRestart: () => window.location.reload(),
  onPause: () => runtime.showSettings(),
  howTo: {
    gameId: "sudoku",
    title: "How to play Sudoku",
    subtitle: "Fill each row, column, and 3×3 box once.",
    steps: ["Pick a cell", "Use 1–9 keys or tap the pad", "Hints are limited"],
    controls: ["Arrow keys move", "N toggles notes", "H uses a hint"],
  },
});

root.append(page.root);
page.showHowTo();

const runtime = createConsoleRuntime({
  gameId: "sudoku",
  mountEl: page.surfaceInner,
  surfaceEl: page.surface,
  page,
});

await import("/assets/games/sudoku.js")
  .then((mod) => {
    const game = mod?.default || mod?.game;
    if (!game?.init && !game?.mount) {
      throw new Error("Sudoku module missing init/mount export.");
    }
    if (game.init) return game.init(runtime.ctx);
    return game.mount(runtime.ctx.root, runtime.ctx);
  })
  .catch((err) => {
    page.setStatus("Sudoku failed to load.");
    throw err;
  });
