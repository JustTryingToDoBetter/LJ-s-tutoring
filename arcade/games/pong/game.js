import { createConsolePage, lockScroll } from "/assets/arcade/ui/ConsolePage.js";
import { createConsoleRuntime } from "/assets/arcade/console-runtime.js";
import pong from "/assets/games/pong.js";

const root = document.getElementById("game-root");
lockScroll();

const page = createConsolePage({
  title: "Aegean Rally",
  subtitle: "Pong",
  onBack: () => (window.location.href = "/arcade/"),
  onRestart: () => window.location.reload(),
  onPause: () => togglePause(),
  howTo: {
    gameId: "pong",
    title: "How to play Pong",
    subtitle: "First to 7 wins.",
    steps: ["Serve to start the rally", "Score by getting the ball past your opponent", "Use Pause to reset your focus"],
    controls: ["Drag paddles (touch/mouse)", "P toggles pause", "W/S and ↑/↓ for 2P"],
  },
});

root.append(page.root);

const runtime = createConsoleRuntime({
  gameId: "pong",
  mountEl: page.surfaceInner,
  surfaceEl: page.surface,
  page,
});

await pong.mount(page.surfaceInner, runtime.ctx);
page.showHowTo();

function togglePause() {
  if (!pong || !pong._state) return;
  if (pong._state.paused) pong.resume?.();
  else pong.pause?.();
  page.setPauseLabel(Boolean(pong._state.paused));
}
