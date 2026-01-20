/**
 * ui.js
 * Tiny helpers to keep components consistent and accessible.
 */

export function el(tag, attrs = {}, children = []) {
  const node = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (k === "class") node.className = v;
    else if (k.startsWith("on") && typeof v === "function") node.addEventListener(k.slice(2), v);
    else if (v === true) node.setAttribute(k, "");
    else if (v !== false && v != null) node.setAttribute(k, String(v));
  }
  for (const c of children) node.append(c);
  return node;
}

export function clear(node) {
  while (node.firstChild) node.removeChild(node.firstChild);
}

export function sectionTitle(title, subtitle) {
  return el("div", {}, [
    el("div", { class: "po-game-title" }, [title]),
    el("div", { class: "po-game-sub" }, [subtitle]),
  ]);
}
