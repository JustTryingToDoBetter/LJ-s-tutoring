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
  const wrap = el("div", { class: "po-animate-in" }, [
    el("div", { class: "po-game-title" }, [title]),
    el("div", { class: "po-game-sub" }, [subtitle]),
  ]);
  return wrap;
}

export function gameFrame({ title, subtitle, controls, status, body }) {
  const frame = document.createElement("section");
  frame.className = "po-game-frame po-animate-in";

  frame.innerHTML = `
    <header class="po-game-header">
      <h3>${title}</h3>
      <p>${subtitle}</p>
    </header>

    <div class="po-game-controls"></div>
    <div class="po-game-body"></div>
    <div class="po-game-status"></div>
  `;

  frame.querySelector(".po-game-controls").append(...controls);
  frame.querySelector(".po-game-body").append(body);
  frame.querySelector(".po-game-status").append(status);

  return frame;
}
