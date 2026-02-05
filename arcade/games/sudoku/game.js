import { createConsolePage, lockScroll } from "/assets/arcade/ui/ConsolePage.js";

const root = document.getElementById("game-root");
lockScroll();

const page = createConsolePage({
  title: "The Nine Seas",
  subtitle: "Sudoku",
  onBack: () => (window.location.href = "/arcade/"),
  onRestart: () => window.location.reload(),
  onPause: () => {},
  howTo: {
    gameId: "sudoku",
    title: "How to play Sudoku",
    subtitle: "Fill each row, column, and 3×3 box once.",
    steps: ["Pick a cell", "Use 1–9 keys or tap the pad", "Hints are limited"],
    controls: ["Arrow keys move", "N toggles notes", "H uses a hint"],
  },
});

root.append(page.root);
page.showHowTo();

await loadLegacySudoku(page.surfaceInner);

function loadLegacySudoku(mount) {
  return new Promise((resolve, reject) => {
    const script = document.createElement("script");
    script.src = "/assets/games/sudoku.js";
    script.onload = () => {
      const entry = (window.PO_ARCADE_GAMES || []).find((g) => g.id === "sudoku");
      if (!entry?.mount) {
        page.setStatus("Sudoku failed to load.");
        reject(new Error("Sudoku module not registered."));
        return;
      }
      entry.mount(mount);
      resolve();
    };
    script.onerror = () => {
      page.setStatus("Sudoku failed to load.");
      reject(new Error("Sudoku script failed to load."));
    };
    document.head.appendChild(script);
  });
}
