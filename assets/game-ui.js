/**
 * game-ui.js
 * Unified UI shell for all arcade games.
 * Requires: ctx.root provided by your runtime (boot contract).
 */

function el(tag, attrs = {}, children = []) {
  const node = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (k === "class") node.className = v;
    else if (k === "text") node.textContent = v;
    else if (k.startsWith("on") && typeof v === "function") node.addEventListener(k.slice(2).toLowerCase(), v);
    else if (v !== false && v != null) node.setAttribute(k, String(v));
  }
  for (const c of children) node.append(c);
  return node;
}

function clear(node) { while (node.firstChild) node.removeChild(node.firstChild); }

export function createGameUI(ctx, {
  title,
  subtitle,
  onBack,
  onRestart,
  onPauseToggle,
} = {}) {
  // Shell
  const shell = el("div", { class: "po-game-shell" });

  const titleBlock = el("div", { class: "po-game-titleblock" }, [
    el("div", { class: "po-game-title", text: title || "Game" }),
    el("div", { class: "po-game-sub", text: subtitle || "" }),
  ]);

  const btnBack = el("button", {
    class: "po-btn po-btn--ghost",
    type: "button",
    onClick: () => onBack?.(),
    "aria-label": "Back to arcade",
  }, ["Back"]);

  const btnRestart = el("button", {
    class: "po-btn",
    type: "button",
    onClick: () => onRestart?.(),
    "aria-label": "Restart",
  }, ["Restart"]);

  const btnPause = el("button", {
    class: "po-btn po-btn--primary",
    type: "button",
    onClick: () => onPauseToggle?.(),
    "aria-label": "Pause",
  }, ["Pause"]);

  const actions = el("div", { class: "po-game-actions" }, [btnBack, btnRestart, btnPause]);

  const topbar = el("div", { class: "po-game-topbar" }, [titleBlock, actions]);

  const hud = el("div", { class: "po-panel po-hud", "aria-label": "HUD" });
  const hudRow = el("div", { class: "po-hud-row" }, []);
  hud.appendChild(hudRow);

  const stage = el("div", { class: "po-stage", "aria-label": "Game stage" });
  const stageInner = el("div", { class: "po-stage-inner" });
  stage.appendChild(stageInner);

  const controls = el("div", { class: "po-panel po-controls", hidden: true, "aria-label": "Controls" }, []);
  const controlsBody = el("div", {}, []);
  controls.appendChild(controlsBody);

  shell.append(topbar, hud, stage, controls);
  ctx.root.appendChild(shell);

  // Clean up shell on destroy
  ctx.onCleanup(() => shell.remove());

  // Modal + toast state
  let modalEl = null;
  let toastEl = null;
  let toastTimerOff = null;

  const api = {
    /** Where the game should render its canvas/board/etc. */
    stageEl: stageInner,

    setPauseLabel(isPaused) {
      btnPause.textContent = isPaused ? "Resume" : "Pause";
      btnPause.setAttribute("aria-label", isPaused ? "Resume" : "Pause");
    },

    setHUD(items = []) {
      // items: [{ k:"Score", v:"12" }, ...]
      clear(hudRow);
      for (const it of items) {
        hudRow.appendChild(
          el("div", { class: "po-chip" }, [
            el("span", { class: "po-chip__k", text: String(it.k ?? "") }),
            el("span", { class: "po-chip__v", text: String(it.v ?? "") }),
          ])
        );
      }
    },

    setControls(spec) {
      // spec examples:
      // { type:"dpad", on:{up,down,left,right}, extras:[{label, onClick}] }
      // { type:"buttons", buttons:[{label, onClick, primary}] }
      if (!spec) {
        controls.hidden = true;
        clear(controlsBody);
        return;
      }
      controls.hidden = false;
      clear(controlsBody);

      if (spec.type === "dpad") {
        const grid = el("div", { class: "po-controls-grid" }, [
          el("div", { class: "po-dpad-spacer" }, ["·"]),
          mkBtn("↑", spec.on?.up),
          el("div", { class: "po-dpad-spacer" }, ["·"]),
          mkBtn("←", spec.on?.left),
          mkBtn("↓", spec.on?.down),
          mkBtn("→", spec.on?.right),
        ]);
        controlsBody.appendChild(grid);

        if (spec.extras?.length) {
          const row = el("div", { class: "po-pillrow" }, spec.extras.map(x =>
            el("button", { class: `po-btn ${x.primary ? "po-btn--primary" : ""}`, type: "button", onClick: x.onClick }, [x.label])
          ));
          controlsBody.appendChild(row);
        }
      }

      if (spec.type === "buttons") {
        const row = el("div", { class: "po-pillrow" }, spec.buttons.map(x =>
          el("button", { class: `po-btn ${x.primary ? "po-btn--primary" : ""}`, type: "button", onClick: x.onClick }, [x.label])
        ));
        controlsBody.appendChild(row);
      }

      function mkBtn(label, fn) {
        return el("button", {
          class: "po-btn",
          type: "button",
          onClick: () => fn?.(),
          "aria-label": `Control ${label}`,
        }, [label]);
      }
    },

    toast(message, ms = 1600) {
      if (toastEl) toastEl.remove();
      toastEl = el("div", { class: "po-toast", role: "status", "aria-live": "polite", text: String(message) });
      document.body.appendChild(toastEl);
      ctx.onCleanup(() => toastEl?.remove());

      if (toastTimerOff) toastTimerOff();
      toastTimerOff = ctx.timeout(() => {
        toastEl?.remove();
        toastEl = null;
      }, ms);
    },

    showModal({ title, body, actions = [], variant, adSlot = false } = {}) {
      api.closeModal();

      const modalClass = ["po-modal", variant ? `po-modal--${variant}` : ""]
        .filter(Boolean)
        .join(" ");

      const adSafe = () =>
        el("div", { class: "po-ad-safe" }, [
          el("div", { class: "po-ad-safe__label", text: "Ad safe zone" }),
        ]);

      const modalChildren = [
        el("h3", { text: String(title || "") }),
        el("p", { text: String(body || "") }),
      ];

      if (adSlot) modalChildren.push(adSafe());

      modalChildren.push(
        el("div", { class: "po-modal-actions" }, actions.map(a =>
          el("button", {
            class: `po-btn ${a.primary ? "po-btn--primary" : ""}`,
            type: "button",
            onClick: () => { a.onClick?.(); if (!a.keepOpen) api.closeModal(); },
          }, [a.label])
        ))
      );

      modalEl = el("div", { class: "po-modal-backdrop" }, [
        el("div", { class: modalClass }, modalChildren),
      ]);

      // tap outside to close
      modalEl.addEventListener("click", (e) => {
        if (e.target === modalEl) api.closeModal();
      });

      document.body.appendChild(modalEl);
      ctx.onCleanup(() => modalEl?.remove());
    },

    closeModal() {
      if (!modalEl) return;
      modalEl.remove();
      modalEl = null;
    },

    showPause({ onResume, onQuit, onSettings } = {}) {
      api.showModal({
        title: "Paused",
        body: "Take a breather. Your progress is safe.",
        variant: "pause",
        adSlot: true,
        actions: [
          { label: "Settings", onClick: onSettings, keepOpen: true },
          { label: "Quit", onClick: onQuit },
          { label: "Resume", onClick: onResume, primary: true },
        ],
      });
    },

    showEnd({ title = "Game Over", summary = "", onRestart, onBack } = {}) {
      api.showModal({
        title,
        body: summary || "Nice run.",
        variant: "end",
        adSlot: true,
        actions: [
          { label: "Back", onClick: onBack },
          { label: "Restart", onClick: onRestart, primary: true },
        ],
      });
    },
  };

  return api;
}