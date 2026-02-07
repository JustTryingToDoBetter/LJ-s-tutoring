import { createConsolePage, lockScroll } from "/assets/arcade/ui/ConsolePage.js";
import { createConsoleRuntime } from "/assets/arcade/console-runtime.js";
import game2048 from "/assets/games/2048.js";

const root = document.getElementById("game-root");
lockScroll();

const page = createConsolePage({
  title: "2048",
  subtitle: "Tile Merge",
  onBack: () => (window.location.href = "/arcade/"),
  onRestart: () => window.location.reload(),
  onPause: () => runtime.showSettings(),
  howTo: {
    gameId: "2048",
    title: "How to play 2048",
    subtitle: "Merge tiles to reach 2048 and beyond.",
    steps: ["Swipe to slide tiles", "Matching tiles merge", "No moves left ends the run"],
    controls: ["Keyboard: Arrow keys", "Touch: Swipe"],
  },
});

root.append(page.root);

const runtime = createConsoleRuntime({
  gameId: "2048",
  mountEl: page.surfaceInner,
  surfaceEl: page.surface,
  page,
});

await game2048.init(runtime.ctx);
page.showHowTo();
