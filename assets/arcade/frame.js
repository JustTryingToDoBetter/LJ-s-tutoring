/**
 * frame.js
 * Single, consistent "Game Frame" used by every arcade game.
 * - HUD chips (optional)
 * - Stage surface (where the game renders)
 * - Controls dock (for game-specific controls)
 * - Status line (for prompts/errors)
 *
 * This file is an ES module and is loaded via dynamic import() from assets/arcade.js.
 */

import { el, clear } from "../lib/ui.js";

export function createGameFrame({ mount, title = "Game", subtitle = "Odyssey Arcade" }) {
  clear(mount);

  const ac = new AbortController();
  const { signal } = ac;

  let modalEl = null;
  let toastEl = null;
  let toastTimer = null;

  const shell = el("section", { class: "po-game-shell" });

  // HUD (optional)
  const hudPanel = el("div", { class: "po-panel po-hud", hidden: true });
  const hudRow = el("div", { class: "po-hud-row" });
  hudPanel.append(hudRow);

  // Stage
  const stage = el("div", { class: "po-stage po-panel", role: "region", "aria-label": `${title} stage`, tabindex: "0" });
  const stageInner = el("div", { class: "po-stage-inner" });
  stage.append(stageInner);

  // Controls (optional)
  const controlsPanel = el("div", { class: "po-panel po-controls", hidden: true });
  const controlsInner = el("div", {});
  controlsPanel.append(controlsInner);

  // Status (optional)
  const statusPanel = el("div", { class: "po-panel po-status", hidden: true });
  const statusText = el("div", { class: "po-status__text", text: "" });
  statusPanel.append(statusText);

  shell.append(hudPanel, stage, controlsPanel, statusPanel);
  mount.append(shell);

  function setHUD(chips = []) {
    clear(hudRow);

    if (!chips || chips.length === 0) {
      hudPanel.hidden = true;
      return;
    }

    for (const { k, v } of chips) {
      hudRow.append(
        el("span", { class: "po-chip" }, [
          el("span", { class: "po-chip__k", text: k }),
          el("span", { class: "po-chip__v", text: v }),
        ])
      );
    }
    hudPanel.hidden = false;
  }

  function setControls(nodeOrNodes) {
    clear(controlsInner);

    if (!nodeOrNodes) {
      controlsPanel.hidden = true;
      return;
    }

    const nodes = Array.isArray(nodeOrNodes) ? nodeOrNodes : [nodeOrNodes];
    for (const n of nodes) controlsInner.append(n);
    controlsPanel.hidden = false;
  }

  function setStatus(text) {
    const msg = String(text || "").trim();
    if (!msg) {
      statusPanel.hidden = true;
      statusText.textContent = "";
      return;
    }
    statusText.textContent = msg;
    statusPanel.hidden = false;
  }

  stage.addEventListener("pointerdown", () => {
    try { stage.focus({ preventScroll: true }); } catch {}
  }, { signal });

  function focusStage() {
    try { stage.focus({ preventScroll: true }); } catch {}
  }

  function destroy() {
    ac.abort();
    // mount is about to be navigated away or re-mounted; keep it tidy
    clear(mount);
    try { modalEl?.remove(); } catch {}
    try { toastEl?.remove(); } catch {}
  }

  function closeModal() {
    if (!modalEl) return;
    modalEl.remove();
    modalEl = null;
  }

  function showModal({ title: header, body, content, actions = [] } = {}) {
    closeModal();

    const bodyNode = content
      ? content
      : el("p", { text: String(body || "") });

    modalEl = el("div", { class: "po-modal-backdrop", role: "presentation" }, [
      el("div", { class: "po-modal", role: "dialog", "aria-modal": "true" }, [
        el("h3", { text: String(header || "") }),
        bodyNode,
        el("div", { class: "po-modal-actions" }, actions.map(a =>
          el("button", {
            class: `po-btn ${a.primary ? "po-btn--primary" : ""}`,
            type: "button",
            onClick: () => { a.onClick?.(); if (!a.keepOpen) closeModal(); },
          }, [a.label])
        )),
      ]),
    ]);

    modalEl.addEventListener("click", (e) => {
      if (e.target === modalEl) closeModal();
    }, { signal });

    document.body.appendChild(modalEl);
  }

  function showToast(message, ms = 1600) {
    if (toastEl) toastEl.remove();
    toastEl = el("div", { class: "po-toast", role: "status", "aria-live": "polite", text: String(message) });
    document.body.appendChild(toastEl);

    if (toastTimer) clearTimeout(toastTimer);
    toastTimer = setTimeout(() => {
      try { toastEl?.remove(); } catch {}
      toastEl = null;
    }, ms);
  }

  function showPause({ onResume, onRestart, onSettings, onQuit } = {}) {
    showModal({
      title: "Paused",
      body: "Take a breather. Your progress is safe.",
      actions: [
        { label: "Settings", onClick: onSettings, keepOpen: true },
        { label: "Restart", onClick: onRestart },
        { label: "Quit", onClick: onQuit },
        { label: "Resume", onClick: onResume, primary: true },
      ],
    });
  }

  function showHowTo({ title: howTitle, subtitle: howSub, steps = [], controls = [] } = {}) {
    const body = el("div", { class: "po-modal-body" }, [
      howSub ? el("p", { text: String(howSub) }) : null,
      steps?.length
        ? el("div", { class: "po-modal-section" }, [
            el("div", { class: "po-modal-label", text: "Goals" }),
            el("ul", { class: "po-modal-list" }, steps.map(s => el("li", { text: s }))),
          ])
        : null,
      controls?.length
        ? el("div", { class: "po-modal-section" }, [
            el("div", { class: "po-modal-label", text: "Controls" }),
            el("ul", { class: "po-modal-list" }, controls.map(s => el("li", { text: s }))),
          ])
        : null,
    ].filter(Boolean));

    showModal({
      title: howTitle || "How to Play",
      content: body,
      actions: [
        { label: "Got it", primary: true },
      ],
    });
  }

  function showSettings({ settings, onChange } = {}) {
    const state = { ...settings };

    const muteBtn = el("button", { class: "po-btn", type: "button" }, [state.mute ? "Unmute" : "Mute"]);
    const sfxRange = el("input", { class: "po-range", type: "range", min: "0", max: "1", step: "0.05", value: String(state.sfxVolume ?? 0.7) });
    const musicRange = el("input", { class: "po-range", type: "range", min: "0", max: "1", step: "0.05", value: String(state.musicVolume ?? 0.5) });
    const motionToggle = el("button", { class: "po-btn", type: "button" }, [state.reducedMotion ? "Reduced Motion: On" : "Reduced Motion: Off"]);

    const body = el("div", { class: "po-modal-body" }, [
      el("div", { class: "po-settings-row" }, [
        el("div", { class: "po-settings-label", text: "Mute" }),
        muteBtn,
      ]),
      el("div", { class: "po-settings-row" }, [
        el("div", { class: "po-settings-label", text: "SFX Volume" }),
        sfxRange,
      ]),
      el("div", { class: "po-settings-row" }, [
        el("div", { class: "po-settings-label", text: "Music Volume" }),
        musicRange,
      ]),
      el("div", { class: "po-settings-row" }, [
        el("div", { class: "po-settings-label", text: "Reduced Motion" }),
        motionToggle,
      ]),
    ]);

    const emit = (patch) => onChange?.(patch);

    muteBtn.addEventListener("click", () => {
      state.mute = !state.mute;
      muteBtn.textContent = state.mute ? "Unmute" : "Mute";
      emit({ mute: state.mute });
    }, { signal });

    sfxRange.addEventListener("input", () => emit({ sfxVolume: Number(sfxRange.value) }), { signal });
    musicRange.addEventListener("input", () => emit({ musicVolume: Number(musicRange.value) }), { signal });

    motionToggle.addEventListener("click", () => {
      state.reducedMotion = !state.reducedMotion;
      motionToggle.textContent = state.reducedMotion ? "Reduced Motion: On" : "Reduced Motion: Off";
      emit({ reducedMotion: state.reducedMotion });
    }, { signal });

    showModal({
      title: "Settings",
      content: body,
      actions: [
        { label: "Done", primary: true },
      ],
    });
  }

  function showError(message) {
    showModal({
      title: "Something went wrong",
      body: String(message || "Unknown error"),
      actions: [
        { label: "Close", primary: true },
      ],
    });
  }

  return {
    signal,
    shell,

    // Mount points
    stage,
    stageInner,
    controlsInner,

    // Frame API
    setHUD,
    setControls,
    setStatus,
    focusStage,
    showModal,
    closeModal,
    showToast,
    showPause,
    showHowTo,
    showSettings,
    showError,
    destroy,
  };
}
