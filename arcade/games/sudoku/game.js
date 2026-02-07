import { createConsolePage, lockScroll } from "/assets/arcade/ui/ConsolePage.js";
import { createArcadeStore } from "/assets/arcade/sdk-core.js";
import { createModal } from "/assets/arcade/ui/Modal.js";
import { createToastManager } from "/assets/arcade/ui/Toast.js";
import { createGameContext } from "/arcade/game-runtime.js";

const root = document.getElementById("game-root");
lockScroll();

const page = createConsolePage({
  title: "The Nine Seas",
  subtitle: "Sudoku",
  onBack: () => (window.location.href = "/arcade/"),
  onRestart: () => window.location.reload(),
  onPause: () => {},
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

await loadSudokuModule(page.surfaceInner);

function loadSudokuModule(mount) {
  const ctx = createGameContext({ root: mount, gameId: "sudoku" });
  const store = createArcadeStore();
  const toastManager = createToastManager(page.surface);

  ctx.ui = {
    setHUD: (chips) => page.setHUD(chips),
    setControls: (node) => page.setControls(node),
    setStatus: (text) => page.setStatus(text),
    showToast: (msg, ms) => toastManager.show(msg, ms),
    showModal: ({ title, body, content, actions, onClose, closeOnBackdrop } = {}) => {
      const modal = createModal({
        title: title || "",
        body,
        content,
        actions: actions || [],
        onClose,
        closeOnBackdrop,
      });
      page.surface.append(modal.root);
      return modal;
    },
  };
  ctx.store = store;
  ctx.onCleanup(() => toastManager.destroy());

  return import("/assets/games/sudoku.js")
    .then((mod) => {
      const game = mod?.default || mod?.game;
      if (!game?.init && !game?.mount) {
        throw new Error("Sudoku module missing init/mount export.");
      }
      if (game.init) return game.init(ctx);
      return game.mount(ctx.root, ctx);
    })
    .catch((err) => {
      page.setStatus("Sudoku failed to load.");
      throw err;
    });
}
