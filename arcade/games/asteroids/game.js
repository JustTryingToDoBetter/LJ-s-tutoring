import { createConsolePage, lockScroll } from "/assets/arcade/ui/ConsolePage.js";
import { createConsoleRuntime } from "/assets/arcade/console-runtime.js";
import asteroids from "/assets/games/asteroids.js";

const root = document.getElementById("game-root");
lockScroll();

const page = createConsolePage({
  title: "Aether Drift",
  subtitle: "Asteroids-lite",
  onBack: () => (window.location.href = "/arcade/"),
  onRestart: () => window.location.reload(),
  onPause: () => runtime.showSettings(),
  howTo: {
    gameId: "asteroids",
    title: "How to play Aether Drift",
    subtitle: "Drift, dodge, and clear the field.",
    steps: ["Rotate and thrust to steer", "Fire to break asteroids", "Clear the wave to advance"],
    controls: ["Keyboard: Left/Right rotate, Up thrust, Space fire", "Touch: Rotate + Thrust + Fire"],
  },
});

root.append(page.root);

const runtime = createConsoleRuntime({
  gameId: "asteroids",
  mountEl: page.surfaceInner,
  surfaceEl: page.surface,
  page,
});

await asteroids.init(runtime.ctx);
page.showHowTo();
