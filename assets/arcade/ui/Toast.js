import { el } from "./dom.js";

export function createToastManager(mountEl = document.body) {
  const stack = el("div", { class: "arc-toast-stack", role: "region", "aria-live": "polite" });
  mountEl.append(stack);

  let timer = null;

  const show = (message, ms = 1600) => {
    const toast = el("div", { class: "arc-toast", role: "status", text: String(message ?? "") });
    stack.append(toast);

    if (timer) clearTimeout(timer);
    timer = setTimeout(() => {
      try { toast.remove(); } catch {}
    }, ms);
  };

  const destroy = () => {
    if (timer) clearTimeout(timer);
    stack.remove();
  };

  return { show, destroy, stack };
}
