import { createArcadeStore } from "/assets/arcade/sdk-core.js";
import { createConsolePage, lockScroll } from "/assets/arcade/ui/ConsolePage.js";
import quickmath from "/assets/games/quickmath.js";

const root = document.getElementById("game-root");
lockScroll();

const page = createConsolePage({
  title: "Storm Sprint",
  subtitle: "Quick Math",
  onBack: () => (window.location.href = "/arcade/"),
  onRestart: () => window.location.reload(),
  onPause: () => togglePause(),
  howTo: {
    gameId: "quickmath",
    title: "How to play Quick Math",
    subtitle: "Answer fast, build streaks, beat your best.",
    steps: ["Press Start Sprint", "Type answers + Enter", "Streaks multiply points"],
    controls: ["Keyboard input", "Pause to catch your breath"],
  },
});

root.append(page.root);

const store = createArcadeStore();

const ctx = {
  ui: {
    setHUD: (chips) => page.setHUD(chips),
    setControls: (node) => page.setControls(node),
    setStatus: (text) => page.setStatus(text),
  },
  store,
};

await quickmath.init?.(ctx);
page.showHowTo();

function togglePause() {
  quickmath.pause?.();
  page.setPauseLabel(Boolean(quickmath._state?.paused));
}
