import { el } from "./dom.js";
import { createButton } from "./Button.js";

export function createModal({
  title = "",
  body,
  content,
  actions = [],
  onClose,
  closeOnBackdrop = true,
  variant,
  adSlot = false,
} = {}) {
  const classes = ["arc-modal", variant ? `arc-modal--${variant}` : ""].filter(Boolean).join(" ");
  const dialog = el("div", { class: classes, role: "dialog", "aria-modal": "true" });

  if (title) {
    dialog.append(el("h3", { class: "arc-modal__title", text: title }));
  }

  const bodyNode = content
    ? content
    : el("p", { class: "arc-modal__body", text: String(body ?? "") });
  dialog.append(bodyNode);

  if (adSlot) {
    dialog.append(
      el("div", { class: "arc-ad-safe" }, [
        el("div", { class: "arc-ad-safe__label", text: "Ad safe zone" }),
      ])
    );
  }

  const actionsRow = el("div", { class: "arc-modal__actions" });
  for (const action of actions) {
    const btn = createButton({
      label: action.label,
      variant: action.primary ? "primary" : action.variant || "default",
      ariaLabel: action.ariaLabel,
      onClick: () => {
        action.onClick?.();
        if (!action.keepOpen) close();
      },
    });
    actionsRow.append(btn);
  }
  if (actions.length) dialog.append(actionsRow);

  const closeBtn = createButton({
    label: "Close",
    icon: "✕",
    variant: "ghost",
    ariaLabel: "Close modal",
    onClick: () => close(),
  });
  closeBtn.classList.add("arc-modal__close");
  dialog.append(closeBtn);

  const backdrop = el("div", { class: "arc-modal-backdrop", role: "presentation" }, [dialog]);

  if (closeOnBackdrop) {
    backdrop.addEventListener("click", (e) => {
      if (e.target === backdrop) close();
    });
  }

  function close() {
    backdrop.remove();
    onClose?.();
  }

  return { root: backdrop, close };
}
