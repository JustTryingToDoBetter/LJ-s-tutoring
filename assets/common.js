
const API_BASE = (window.__PO_API_BASE__ || '').replace(/\/$/, '');

export function apiUrl(path) {
  return `${API_BASE}${path}`;
}

export function getCsrfToken() {
  const cookie = document.cookie.split('; ').find((entry) => entry.startsWith('csrf='));
  return cookie ? decodeURIComponent(cookie.split('=').slice(1).join('=')) : '';
}

export async function apiFetch(path, options = {}) {
  const method = options.method || 'GET';
  const headers = new Headers(options.headers || {});
  if (!headers.has('content-type') && options.body && !(options.body instanceof FormData)) {
    headers.set('content-type', 'application/json');
  }
  if (['POST', 'PATCH', 'DELETE'].includes(method)) {
    const csrf = getCsrfToken();
    if (csrf) headers.set('x-csrf-token', csrf);
  }
  const response = await fetch(apiUrl(path), {
    ...options,
    method,
    headers,
    credentials: 'include',
    body: options.body && headers.get('content-type') === 'application/json' && typeof options.body !== 'string'
      ? JSON.stringify(options.body)
      : options.body,
  });
  return response;
}

export function setActiveNav(page) {
  document.querySelectorAll('[data-nav]').forEach((link) => {
    link.dataset.active = String(link.dataset.nav === page);
  });
}

export function setText(selector, value) {
  const node = document.querySelector(selector);
  if (node) node.textContent = value;
}

export function renderEmpty(target, text) {
  target.innerHTML = `<div class="empty-state">${text}</div>`;
}

export function renderList(target, items, renderer) {
  target.innerHTML = '';
  if (!items || items.length === 0) {
    renderEmpty(target, 'No data available yet.');
    return;
  }
  items.forEach((item) => {
    const wrapper = document.createElement('div');
    wrapper.className = 'list-item';
    wrapper.innerHTML = renderer(item);
    target.appendChild(wrapper);
  });
}

export async function loadJson(path, options) {
  const res = await apiFetch(path, options);
  if (!res.ok) {
    const text = await res.text();
    throw new Error(text || `request_failed:${res.status}`);
  }
  return res.json();
}
