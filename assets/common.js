
function resolveApiBase() {
  const raw = String(window.__PO_API_BASE__ || '').replace(/\/$/, '');
  const host = window.location.hostname;
  const isLocalHost = (value) => value === 'localhost' || value === '127.0.0.1';

  // Sensible local fallback when config injection has not happened.
  if (!raw || raw === '__PO_API_BASE__') {
    if (isLocalHost(host)) {
      return `${window.location.protocol}//${host}:3001`;
    }
    // In production we deploy the API behind the same-origin gateway path.
    return '/api';
  }

  // Production may use a relative /api gateway path. The local static server
  // does not proxy that path, so point browser API calls at the local API.
  if (isLocalHost(host) && raw === '/api') {
    return `${window.location.protocol}//${host}:3001`;
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

function generateRequestId() {
  try {
    if (window.crypto && typeof window.crypto.randomUUID === 'function') {
      return window.crypto.randomUUID();
    }
  } catch {
    /* noop */
  }
  return `po-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
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
  if (!headers.has('x-request-id')) {
    headers.set('x-request-id', generateRequestId());
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

export function clearChildren(node) {
  if (!node) {return;}
  while (node.firstChild) {
    node.removeChild(node.firstChild);
  }
}

export function renderEmpty(target, text) {
  clearChildren(target);
  const empty = document.createElement('div');
  empty.className = 'empty-state';
  empty.textContent = String(text ?? '');
  target.appendChild(empty);
}

/**
 * Build a list-item element from a plain-object spec. The caller provides
 * safe text/attribute values and nested children; nothing is interpolated as
 * HTML. This is the safe alternative to `innerHTML` for rendering per-item
 * templates that include user/domain data.
 *
 * spec: {
 *   className?: string,
 *   dataset?: Record<string, string>,
 *   rows: Array<string | HTMLElement | { el?: string, text?: string, className?: string }>
 * }
 */
export function buildSafeItem(spec) {
  const wrapper = document.createElement('div');
  wrapper.className = spec?.className || 'list-item';
  if (spec?.dataset) {
    for (const [k, v] of Object.entries(spec.dataset)) {
      if (v !== null && v !== undefined) {wrapper.dataset[k] = String(v);}
    }
  }
  const rows = Array.isArray(spec?.rows) ? spec.rows : [];
  for (const row of rows) {
    if (row === null || row === undefined) {continue;}
    if (row instanceof HTMLElement) {
      wrapper.appendChild(row);
      continue;
    }
    if (typeof row === 'string') {
      const div = document.createElement('div');
      div.textContent = row;
      wrapper.appendChild(div);
      continue;
    }
    const tag = row.el || 'div';
    const node = document.createElement(tag);
    if (row.className) {node.className = row.className;}
    if (row.text !== null && row.text !== undefined) {node.textContent = String(row.text);}
    if (row.children && Array.isArray(row.children)) {
      for (const child of row.children) {
        if (child instanceof HTMLElement) {node.appendChild(child);}
      }
    }
    wrapper.appendChild(node);
  }
  return wrapper;
}

/**
 * Render a list by mapping each item through a renderer that returns an
 * HTMLElement (or a buildSafeItem spec). Never accepts HTML strings.
 * This is the XSS-safe replacement for the previous innerHTML-based API.
 */
export function renderList(target, items, renderer) {
  if (!target) {return;}
  clearChildren(target);
  if (!items || items.length === 0) {
    renderEmpty(target, 'No data available yet.');
    return;
  }
  items.forEach((item, index) => {
    let node;
    try {
      const result = renderer(item, index);
      if (result instanceof HTMLElement) {
        node = result;
      } else if (result && typeof result === 'object') {
        node = buildSafeItem(result);
      }
    } catch (_err) {
      node = null;
    }
    if (node) {
      target.appendChild(node);
    }
  });
}

export function renderError(target, text) {
  if (!target) {return;}
  clearChildren(target);
  const err = document.createElement('div');
  err.className = 'empty-state error-state';
  err.setAttribute('role', 'alert');
  err.textContent = String(text ?? 'Something went wrong.');
  target.appendChild(err);
}

export function renderLoading(target, text) {
  if (!target) {return;}
  clearChildren(target);
  const loading = document.createElement('div');
  loading.className = 'empty-state loading-state';
  loading.setAttribute('aria-busy', 'true');
  loading.textContent = String(text ?? 'Loading…');
  target.appendChild(loading);
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
