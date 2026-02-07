import { createConsolePage, lockScroll } from "/assets/arcade/ui/ConsolePage.js";
import { createConsoleRuntime } from "/assets/arcade/console-runtime.js";
import snake from "/assets/games/snake.js";

const root = document.getElementById("game-root");
lockScroll();

const page = createConsolePage({
  title: "Serpent of Scylla",
  subtitle: "Snake",
  onBack: () => (window.location.href = "/arcade/"),
  onRestart: () => window.location.reload(),
  onPause: () => togglePause(),
  howTo: {
    gameId: "snake",
    title: "How to play Snake",
    subtitle: "Grow the serpent without crashing.",
    steps: ["Eat to grow and score", "Avoid your tail", "Use pause when you need a break"],
    controls: ["Swipe to turn", "Tap D‑pad for precise moves", "Arrow keys on desktop"],
  },
});

root.append(page.root);

const runtime = createConsoleRuntime({
  gameId: "snake",
  mountEl: page.surfaceInner,
  surfaceEl: page.surface,
  page,
});

await snake.mount(page.surfaceInner, runtime.ctx);
page.showHowTo();

function togglePause() {
  if (!snake || !snake._state) return;
  if (snake._state.paused) snake.resume?.();
  else snake.pause?.();
  page.setPauseLabel(Boolean(snake._state.paused));
}
