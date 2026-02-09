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

import { el } from "./ui/dom.js";
import { createModal } from "./ui/Modal.js";
import { createToastManager } from "./ui/Toast.js";
import { createHUD } from "./ui/HUD.js";
import { createSettingsPanel } from "./ui/SettingsPanel.js";
import { createHowTo } from "./ui/HowTo.js";

export function createGameFrame({ mount, title = "Game", subtitle = "Odyssey Arcade" }) {
  const clear = (node) => {
    if (!node) return;
    if (node.replaceChildren) node.replaceChildren();
    else while (node.firstChild) node.removeChild(node.firstChild);
  };

  clear(mount);

  const ac = new AbortController();
  const { signal } = ac;

  let modal = null;

  const shell = el("section", { class: "po-game-shell arcade-shell" });

  // HUD (optional)
  const hudSlot = el("div", { class: "po-panel po-hud", hidden: true });

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

  const overlay = el("div", { class: "arc-overlay" });
  const toastManager = createToastManager(overlay);

  shell.append(hudSlot, stage, controlsPanel, statusPanel, overlay);
  mount.append(shell);

  function setHUD(chips = []) {
    clear(hudSlot);

    if (!chips || chips.length === 0) {
      hudSlot.hidden = true;
      return;
    }

    const hud = createHUD({ leftStats: chips, title });
    hudSlot.append(hud);
    hudSlot.hidden = false;
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
    try { modal?.close?.(); } catch {}
    try { toastManager?.destroy?.(); } catch {}
  }

  function closeModal() {
    if (!modal) return;
    modal.close?.();
    modal = null;
  }

  function showModal({ title: header, body, content, actions = [], onClose, closeOnBackdrop, variant, adSlot } = {}) {
    closeModal();

    modal = createModal({
      title: String(header || ""),
      body,
      content,
      actions,
      onClose,
      closeOnBackdrop,
      variant,
      adSlot,
    });

    overlay.append(modal.root);
  }

  function showToast(message, ms = 1600) {
    toastManager.show(String(message), ms);
  }

  function showPause({ onResume, onRestart, onSettings, onQuit } = {}) {
    showModal({
      title: "Paused",
      body: "Take a breather. Your progress is safe.",
      variant: "pause",
      adSlot: true,
      adPlacement: "pause_screen_banner",
      actions: [
        { label: "Settings", onClick: onSettings, keepOpen: true },
        { label: "Restart", onClick: onRestart },
        { label: "Quit", onClick: onQuit },
        { label: "Resume", onClick: onResume, primary: true },
      ],
    });
  }

  function showEnd({ title: endTitle = "Game Over", summary = "", onRestart, onBack } = {}) {
    showModal({
      title: endTitle,
      body: summary || "Nice run.",
      variant: "end",
      adSlot: true,
      adPlacement: "post_run_reward",
      actions: [
        { label: "Back", onClick: onBack },
        { label: "Restart", onClick: onRestart, primary: true },
      ],
    });
  }

  function showHowTo({ gameId, title: howTitle, subtitle: howSub, steps = [], controls = [], auto = false } = {}) {
    const how = createHowTo({ gameId, title: howTitle, subtitle: howSub, steps, controls });
    if (auto && !how.shouldShow()) return;

    showModal({
      title: how.title || "How to Play",
      content: how.content,
      onClose: () => how.onClose?.(),
      actions: [
        { label: "Got it", primary: true, onClick: () => how.onClose?.() },
      ],
    });
  }

  function showSettings({ settings, onChange } = {}) {
    const { panel } = createSettingsPanel({ settings, onChange });

    showModal({
      title: "Settings",
      content: panel,
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
    showEnd,
    destroy,
  };
}
