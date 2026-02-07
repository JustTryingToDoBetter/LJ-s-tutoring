import { createConsolePage, lockScroll } from "/assets/arcade/ui/ConsolePage.js";
import { createConsoleRuntime } from "/assets/arcade/console-runtime.js";
import invaders from "/assets/games/invaders.js";

const root = document.getElementById("game-root");
lockScroll();

const page = createConsolePage({
  title: "Neon Invaders",
  subtitle: "Space Invaders",
  onBack: () => (window.location.href = "/arcade/"),
  onRestart: () => window.location.reload(),
  onPause: () => runtime.showSettings(),
  howTo: {
    gameId: "invaders",
    title: "How to play Neon Invaders",
    subtitle: "Defend the beacon. Clear the wave.",
    steps: ["Move left/right to dodge and line up shots", "Fire to clear the formation", "Survive as speed ramps up"],
    controls: ["Keyboard: Arrow keys or A/D, Space to fire", "Touch: Left/Right + Fire"],
  },
});

root.append(page.root);

const runtime = createConsoleRuntime({
  gameId: "invaders",
  mountEl: page.surfaceInner,
  surfaceEl: page.surface,
  page,
});

await invaders.init(runtime.ctx);
page.showHowTo();
