import { createGameUI } from "/assets/game-ui.js";
import { createGameSDK } from "/assets/arcade/game-sdk.js";
import { difficultyAt } from "/assets/arcade/difficulty.js";
import { snakeConfig } from "./config.js";

export default {
  id: "snake",
  title: "Neon Snake",

  init(ctx) {
    const ui = createGameUI(ctx, {
      title: snakeConfig.ui.title,
      subtitle: snakeConfig.ui.subtitle,
      onBack: () => (location.href = "/arcade/"),
      onRestart: () => location.reload(),
      onPauseToggle: () => {
        sdk.state.paused = !sdk.state.paused;
        ui.setPauseLabel(sdk.state.paused);
        if (sdk.state.paused) ui.showPause({
          onResume: () => { sdk.state.paused = false; ui.setPauseLabel(false); ui.closeModal(); },
          onQuit: () => (location.href = "/arcade/"),
          onSettings: () => ui.toast("Settings hook ready"),
        });
      },
    });

    const sdk = createGameSDK(ctx, {
      gameId: "snake",
      config: snakeConfig,
      contentPack: {},
      ui,
    });

    // Stage canvas
    const canvas = document.createElement("canvas");
    canvas.width = 720; canvas.height = 480;
    canvas.style.width = "100%";
    canvas.style.height = "100%";
    ui.stageEl.appendChild(canvas);
    const g = canvas.getContext("2d", { alpha: true });

    // Controls (not hardcoded: can be read from config later)
    let dir = { x: 1, y: 0 };
    let tickIndex = 0;
    const emitInput = (next) => {
      sdk.emitDeterministicEvent("input", { dir: next }, tickIndex);
    };

    const setDir = (next) => {
      if (next.x === -dir.x && next.y === -dir.y) return;
      if (dir.x === next.x && dir.y === next.y) return;
      dir = next;
      emitInput(next);
    };
    ui.setControls({
      type: "dpad",
      on: {
        up: () => setDir({ x: 0, y: -1 }),
        down: () => setDir({ x: 0, y: 1 }),
        left: () => setDir({ x: -1, y: 0 }),
        right: () => setDir({ x: 1, y: 0 }),
      },
      extras: [{ label: "Seed", onClick: () => ui.toast(sdk.runSeed.slice(0, 18) + "…") }],
    });

    const grid = { w: 24, h: 16 };
    const cell = { w: canvas.width / grid.w, h: canvas.height / grid.h };

    const snake = [{ x: 6, y: 8 }, { x: 5, y: 8 }, { x: 4, y: 8 }];
    let item = spawnItem();
    let acc = 0;

    function spawnItem() {
      const kind = sdk.randFromTable(sdk.config.lootTable); // generated
      for (let tries = 0; tries < 200; tries++) {
        const x = sdk.rng.int(0, grid.w - 1);
        const y = sdk.rng.int(0, grid.h - 1);
        if (!snake.some(s => s.x === x && s.y === y)) {
          sdk.emitDeterministicEvent("spawn", { x, y, type: kind.type }, tickIndex);
          return { x, y, ...kind };
        }
      }
      sdk.emitDeterministicEvent("spawn", { x: 10, y: 8, type: "food" }, tickIndex);
      return { x: 10, y: 8, type: "food", points: 1, grow: 1 };
    }

    function tickMs() {
      const d = difficultyAt({
        score: sdk.state.score,
        mode: "score",
        maxScore: sdk.config.pacing.maxScoreForMaxDifficulty,
        curveType: sdk.config.pacing.curveType,
      });
      // difficulty increases -> tick faster
      const { baseTickMs, minTickMs } = sdk.config.pacing;
      return Math.max(minTickMs, Math.floor(baseTickMs - d * (baseTickMs - minTickMs)));
    }

    function hud() {
      sdk.hud([
        { k: "Run", v: sdk.runSeed.slice(0, 10) },
        { k: "Speed", v: `${tickMs()}ms` },
        { k: "Item", v: item.type },
      ]);
    }

    function step() {
      tickIndex += 1;
      const head = snake[0];
      const nx = (head.x + dir.x + grid.w) % grid.w;
      const ny = (head.y + dir.y + grid.h) % grid.h;

      // Self collision -> end
      if (snake.some((s, i) => i > 0 && s.x === nx && s.y === ny)) return end("Self collision");

      snake.unshift({ x: nx, y: ny });

      // Item logic (generated)
      if (nx === item.x && ny === item.y) {
        if (item.type === "hazard") return end("Hit hazard");
        sdk.state.score += item.points;
        // grow by keeping segments
        for (let i = 0; i < Math.max(0, item.grow - 1); i++) snake.push({ ...snake[snake.length - 1] });
        item = spawnItem();
      } else {
        snake.pop();
      }

      // Level derived from score (not hardcoded)
      sdk.state.level = 1 + Math.floor(sdk.state.score / 10);
      hud();
    }

    function draw() {
      g.clearRect(0, 0, canvas.width, canvas.height);

      // background grid (lightweight)
      g.globalAlpha = 0.12;
      for (let x = 0; x <= grid.w; x++) {
        g.beginPath(); g.moveTo(x * cell.w, 0); g.lineTo(x * cell.w, canvas.height); g.stroke();
      }
      for (let y = 0; y <= grid.h; y++) {
        g.beginPath(); g.moveTo(0, y * cell.h); g.lineTo(canvas.width, y * cell.h); g.stroke();
      }
      g.globalAlpha = 1;

      // item
      g.fillRect(item.x * cell.w + 6, item.y * cell.h + 6, cell.w - 12, cell.h - 12);

      // snake
      for (let i = 0; i < snake.length; i++) {
        const s = snake[i];
        g.fillRect(s.x * cell.w + 4, s.y * cell.h + 4, cell.w - 8, cell.h - 8);
      }
    }

    function end(reason) {
      sdk.emitDeterministicEvent("end", { reason, score: sdk.state.score }, tickIndex);
      ui.showEnd({
        title: "Game Over",
        summary: `${reason} • Score ${sdk.state.score} • Seed ${sdk.runSeed.slice(0, 12)}…`,
        onRestart: () => location.reload(),
        onBack: () => (location.href = "/arcade/"),
      });
      sdk.state.paused = true;
    }

    hud();

    // Main loop: accumulator (smooth pacing)
    let last = performance.now();
    ctx.raf((t) => {
      if (sdk.state.paused) { draw(); return; }
      const dt = t - last; last = t;
      acc += dt;

      const ms = tickMs();
      while (acc >= ms) { step(); acc -= ms; }
      draw();
    });

    // Keyboard optional
    ctx.addEvent(window, "keydown", (e) => {
      if (e.key === "ArrowUp") ui.setControls({ type: "dpad", on: { up: () => {}, down: () => {}, left: () => {}, right: () => {} } }); // no-op refresh
    }, { passive: true });
  },
};