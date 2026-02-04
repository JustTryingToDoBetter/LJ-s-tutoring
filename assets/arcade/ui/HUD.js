import { el } from "./dom.js";

export function createHUD({ leftStats = [], title = "", rightActions = [] } = {}) {
  const root = el("div", { class: "arc-hud" });
  const left = el("div", { class: "arc-hud__left" });
  const center = el("div", { class: "arc-hud__title", text: title || "" });
  const right = el("div", { class: "arc-hud__right" });

  for (const stat of leftStats) {
    if (stat instanceof HTMLElement) {
      left.append(stat);
    } else if (stat && typeof stat === "object") {
      left.append(
        el("div", { class: "arc-hud__stat" }, [
          el("span", { class: "arc-hud__label", text: stat.label ?? stat.k ?? "" }),
          el("span", { class: "arc-hud__value", text: stat.value ?? stat.v ?? "" }),
        ])
      );
    }
  }

  for (const action of rightActions) {
    if (action) right.append(action);
  }

  root.append(left, center, right);
  return root;
}
