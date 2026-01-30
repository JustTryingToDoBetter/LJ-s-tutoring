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

  const shell = el("section", { class: "po-game-shell" });

  // HUD (optional)
  const hudPanel = el("div", { class: "po-panel po-hud", hidden: true });
  const hudRow = el("div", { class: "po-hud-row" });
  hudPanel.append(hudRow);

  // Stage
  const stage = el("div", { class: "po-stage po-panel", role: "region", "aria-label": `${title} stage` });
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

  function destroy() {
    ac.abort();
    // mount is about to be navigated away or re-mounted; keep it tidy
    clear(mount);
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
    destroy,
  };
}