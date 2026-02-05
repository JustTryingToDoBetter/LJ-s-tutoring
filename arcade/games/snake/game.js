import { createConsolePage, lockScroll } from "/assets/arcade/ui/ConsolePage.js";
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

const ctx = {
  ui: {
    setHUD: (chips) => page.setHUD(chips),
    setControls: (node) => page.setControls(node),
    setStatus: (text) => page.setStatus(text),
  },
};

await snake.mount(page.surfaceInner, ctx);
page.showHowTo();

function togglePause() {
  if (!snake || !snake._state) return;
  if (snake._state.paused) snake.resume?.();
  else snake.pause?.();
  page.setPauseLabel(Boolean(snake._state.paused));
}
