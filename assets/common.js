
function resolveApiBase() {
  const raw = String(window.__PO_API_BASE__ || '').replace(/\/$/, '');
  const host = window.location.hostname;
  const isLocalHost = (value) => value === 'localhost' || value === '127.0.0.1';

  // Sensible local fallback when config injection has not happened.
  if (!raw || raw === '__PO_API_BASE__') {
    if (isLocalHost(host)) {
      return `${window.location.protocol}//${host}:3001`;
    }
    return '';
  }

  // Keep API host aligned with the page host in local dev to avoid cross-site cookie drops.
  try {
    const parsed = new URL(raw);
    if (isLocalHost(host) && isLocalHost(parsed.hostname) && parsed.hostname !== host) {
      parsed.hostname = host;
      return parsed.toString().replace(/\/$/, '');
    }
  } catch {
    // Fall through and return raw config if not a valid absolute URL.
  }

  return raw;
}

const API_BASE = resolveApiBase();

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
    if (csrf) {headers.set('x-csrf-token', csrf);}
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
  if (node) {
    node.textContent = value;
  }
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
    let payload = null;
    if (text) {
      try {
        payload = JSON.parse(text);
      } catch {
        payload = null;
      }
    }
    const error = new Error(payload?.error || text || `request_failed:${res.status}`);
    error.status = res.status;
    error.code = payload?.error || '';
    error.body = payload;
    throw error;
  }
  return res.json();
}
