import { createConsolePage, lockScroll } from "/assets/arcade/ui/ConsolePage.js";
import { createArcadeStore } from "/assets/arcade/sdk-core.js";
import { createModal } from "/assets/arcade/ui/Modal.js";
import { createToastManager } from "/assets/arcade/ui/Toast.js";
import { createGameContext } from "/arcade/game-runtime.js";

const root = document.getElementById("game-root");
lockScroll();

const page = createConsolePage({
  title: "Aegean Chess",
  subtitle: "Local 2‑player",
  onBack: () => (window.location.href = "/arcade/"),
  onRestart: () => window.location.reload(),
  onPause: () => page.showSettings(),
  howTo: {
    gameId: "chess",
    title: "How to play Chess",
    subtitle: "Local 2‑player. No timers.",
    steps: ["Tap a piece to see legal moves", "Capture the king to win", "Use Undo and Flip for analysis"],
    controls: ["Tap/click to move", "U = undo", "F = flip"],
  },
});

root.append(page.root);
page.showHowTo();

await loadChessModule(page.surfaceInner);

function loadChessModule(mount) {
  const ctx = createGameContext({ root: mount, gameId: "chess" });
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

  return import("/assets/games/chess.js")
    .then((mod) => {
      const game = mod?.default || mod?.game;
      if (!game?.init && !game?.mount) {
        throw new Error("Chess module missing init/mount export.");
      }
      if (game.init) return game.init(ctx);
      return game.mount(ctx.root, ctx);
    })
    .catch((err) => {
      page.setStatus("Chess failed to load.");
      throw err;
    });
}
