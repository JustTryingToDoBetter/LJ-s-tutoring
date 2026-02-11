import { createConsolePage, lockScroll } from "/assets/arcade/ui/ConsolePage.js";
import { createConsoleRuntime } from "/assets/arcade/console-runtime.js";

const root = document.getElementById("game-root");
if (!root) {
  throw new Error("Chess failed to mount: #game-root not found.");
}
lockScroll();

let runtime;

const page = createConsolePage({
  title: "Aegean Chess",
  subtitle: "Local 2‑player",
  onBack: () => (window.location.href = "/arcade/"),
  onRestart: () => window.location.reload(),
  onPause: () => runtime?.showSettings?.(),
  howTo: {
    gameId: "chess",
    title: "How to play Chess",
    subtitle: "Local 2‑player. No timers.",
    steps: ["Tap a piece to see legal moves", "Checkmate the king to win", "Use Undo and Flip for analysis"],
    controls: ["Tap/click to move", "U = undo", "F = flip"],
  },
});

root.append(page.root);
page.showHowTo();

runtime = createConsoleRuntime({
  gameId: "chess",
  mountEl: page.surfaceInner,
  surfaceEl: page.surface,
  page,
});

await import("/assets/games/chess.js")
  .then((mod) => {
    const game = mod?.default || mod?.game;
    if (!game?.init && !game?.mount) {
      throw new Error("Chess module missing init/mount export.");
    }
    if (game.init) return game.init(runtime.ctx);
    return game.mount(runtime.ctx.root, runtime.ctx);
  })
  .catch((err) => {
    page.setStatus("Chess failed to load.");
    console.error("Chess failed to load.", err);
  });
