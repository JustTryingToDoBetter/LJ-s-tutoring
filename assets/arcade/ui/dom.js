export function el(tag, props = {}, children = []) {
  const node = document.createElement(tag);
  for (const [key, value] of Object.entries(props)) {
    if (key === "class") node.className = value;
    else if (key === "text") node.textContent = String(value ?? "");
    else if (key === "html") node.innerHTML = String(value ?? "");
    else if (key === "style" && value && typeof value === "object") Object.assign(node.style, value);
    else if (key === "dataset" && value && typeof value === "object") Object.assign(node.dataset, value);
    else if (key.startsWith("on") && typeof value === "function") node.addEventListener(key.slice(2).toLowerCase(), value);
    else if (value === true) node.setAttribute(key, "");
    else if (value !== false && value != null) node.setAttribute(key, String(value));
  }

  const list = Array.isArray(children) ? children : [children];
  for (const child of list) {
    if (child == null) continue;
    node.append(child);
  }
  return node;
}

export function on(node, event, handler, opts) {
  if (!node?.addEventListener) return () => {};
  node.addEventListener(event, handler, opts);
  return () => {
    try { node.removeEventListener(event, handler, opts); } catch {}
  };
}

export function qs(selector, root = document) {
  return root.querySelector(selector);
}

export function qsa(selector, root = document) {
  return Array.from(root.querySelectorAll(selector));
}

export function addClass(node, ...names) {
  if (!node?.classList) return;
  node.classList.add(...names.filter(Boolean));
}

export function removeClass(node, ...names) {
  if (!node?.classList) return;
  node.classList.remove(...names.filter(Boolean));
}

export function toggleClass(node, name, force) {
  if (!node?.classList) return;
  node.classList.toggle(name, force);
}
