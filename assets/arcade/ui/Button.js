import { el } from "./dom.js";

export function createButton({
  label,
  icon,
  variant = "default",
  onClick,
  ariaLabel,
  disabled = false,
  type = "button",
} = {}) {
  const classes = ["arc-btn", variant ? `arc-btn--${variant}` : ""].filter(Boolean).join(" ");

  const children = [];
  if (icon) children.push(el("span", { class: "arc-btn__icon", "aria-hidden": "true" }, [icon]));
  if (label) children.push(el("span", { class: "arc-btn__label", text: label }));

  const btn = el("button", {
    class: classes,
    type,
    "aria-label": ariaLabel || label || "Button",
    disabled: disabled ? true : false,
    onClick: typeof onClick === "function" ? (e) => onClick(e) : null,
  }, children);

  return btn;
}
