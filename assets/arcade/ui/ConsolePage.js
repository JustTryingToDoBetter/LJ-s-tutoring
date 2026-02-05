import { el } from "./dom.js";
import { createHUD } from "./HUD.js";
import { createModal } from "./Modal.js";
import { createHowTo } from "./HowTo.js";
import { createSettingsPanel } from "./SettingsPanel.js";
import { createButton } from "./Button.js";

export function createConsolePage({
  title,
  subtitle,
  onBack,
  onRestart,
  onPause,
  howTo,
  settings,
} = {}) {
  const root = el("div", { class: "arcade-page" });

  const backBtn = createButton({
    label: "Back",
    icon: "←",
    variant: "ghost",
    ariaLabel: "Back to Arcade",
    onClick: onBack,
  });

  const restartBtn = createButton({
    label: "Restart",
    icon: "⟲",
    variant: "default",
    ariaLabel: "Restart game",
    onClick: onRestart,
  });

  const pauseBtn = createButton({
    label: "Pause",
    icon: "⏸",
    variant: "default",
    ariaLabel: "Pause game",
    onClick: onPause,
  });

  const titleBlock = el("div", { class: "arcade-page__title" }, [
    el("div", { class: "arcade-page__title-text", text: title || "Game" }),
    subtitle ? el("div", { class: "arcade-page__subtitle", text: subtitle }) : null,
  ].filter(Boolean));

  const topbar = el("div", { class: "arcade-page__topbar" }, [
    backBtn,
    titleBlock,
    el("div", { class: "arcade-page__actions" }, [pauseBtn, restartBtn]),
  ]);

  const hud = createHUD({ leftStats: [], title: "Status", rightActions: [] });
  hud.classList.add("arcade-page__hud");

  const surface = el("div", { class: "arcade-page__surface" }, [
    el("div", { class: "arcade-page__surface-inner" }),
  ]);

  const controls = el("div", { class: "arcade-page__controls" });
  const status = el("div", { class: "arcade-page__status", text: "Ready." });

  root.append(topbar, hud, surface, controls, status);

  const surfaceInner = surface.querySelector(".arcade-page__surface-inner");

  const setHUD = (pairs = []) => {
    const leftStats = pairs.map((p) => ({ label: p.k ?? p.label ?? "", value: p.v ?? p.value ?? "" }));
    const next = createHUD({ leftStats, title: "Status", rightActions: [] });
    next.classList.add("arcade-page__hud");
    hud.replaceWith(next);
  };

  const setControls = (nodeOrNodes) => {
    controls.innerHTML = "";
    if (!nodeOrNodes) return;
    const nodes = Array.isArray(nodeOrNodes) ? nodeOrNodes : [nodeOrNodes];
    nodes.forEach((n) => controls.append(n));
  };

  const setStatus = (text) => {
    status.textContent = String(text || "");
  };

  const showHowTo = () => {
    if (!howTo) return;
    const how = createHowTo(howTo);
    if (!how.shouldShow()) return;
    const modal = createModal({
      title: how.title || "How to play",
      content: how.content,
      actions: [{ label: "Start", primary: true }],
      onClose: how.onClose,
    });
    surface.append(modal.root);
  };

  const showSettings = () => {
    const panel = createSettingsPanel({ settings });
    const modal = createModal({
      title: "Settings",
      content: panel.panel,
      actions: [{ label: "Close", primary: true }],
    });
    surface.append(modal.root);
  };

  return {
    root,
    hud,
    surface,
    surfaceInner,
    controls,
    status,
    setHUD,
    setControls,
    setStatus,
    setPauseLabel(isPaused) {
      const label = isPaused ? "Resume" : "Pause";
      pauseBtn.querySelector(".arc-btn__label").textContent = label;
    },
    showHowTo,
    showSettings,
  };
}

export function lockScroll() {
  document.documentElement.classList.add("arcade-page--no-scroll");
  document.body.classList.add("arcade-page--no-scroll");
}

export function unlockScroll() {
  document.documentElement.classList.remove("arcade-page--no-scroll");
  document.body.classList.remove("arcade-page--no-scroll");
}
