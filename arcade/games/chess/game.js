import { createConsolePage, lockScroll } from "/assets/arcade/ui/ConsolePage.js";

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

await loadLegacyChess(page.surfaceInner);

function loadLegacyChess(mount) {
  return new Promise((resolve, reject) => {
    const script = document.createElement("script");
    script.src = "/assets/games/chess.js";
    script.onload = () => {
      const entry = (window.PO_ARCADE_GAMES || []).find((g) => g.id === "chess");
      if (!entry?.mount) {
        page.setStatus("Chess failed to load.");
        reject(new Error("Chess module not registered."));
        return;
      }
      entry.mount(mount);
      resolve();
    };
    script.onerror = () => {
      page.setStatus("Chess failed to load.");
      reject(new Error("Chess script failed to load."));
    };
    document.head.appendChild(script);
  });
}
