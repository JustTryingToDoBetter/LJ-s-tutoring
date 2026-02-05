const API_BASE = window.PO_API_BASE ?? '';

async function request(path, options = {}) {
  const method = String(options.method || 'GET').toUpperCase();
  const csrfToken = getCookie('csrf');
  const res = await fetch(`${API_BASE}${path}`, {
    credentials: 'include',
    headers: {
      'Content-Type': 'application/json',
      ...(csrfToken && !['GET', 'HEAD'].includes(method)
        ? { 'X-CSRF-Token': csrfToken }
        : {}),
      ...(options.headers || {})
    },
    ...options
  });

  let data = null;
  const text = await res.text();
  if (text) {
    try {
      data = JSON.parse(text);
    } catch {
      data = text;
    }
  }

  if (!res.ok) {
    const error = data?.error || res.statusText || 'request_failed';
    throw new Error(error);
  }

  return data;
}

export function apiGet(path) {
  return request(path);
}

export function apiPost(path, payload) {
  return request(path, {
    method: 'POST',
    body: JSON.stringify(payload || {})
  });
}

export function apiPatch(path, payload) {
  return request(path, {
    method: 'PATCH',
    body: JSON.stringify(payload || {})
  });
}

function getCookie(name) {
  const parts = document.cookie.split(';');
  for (const part of parts) {
    const [key, ...rest] = part.trim().split('=');
    if (key === name) return rest.join('=');
  }
  return '';
}

export function qs(id) {
  return document.querySelector(id);
}

export function renderStatus(status) {
  const raw = String(status || 'DRAFT');
  const text = escapeHtml(raw.toLowerCase());
  const safeClass = raw.toLowerCase().replace(/[^a-z0-9_-]/g, '');
  return `<span class="pill ${safeClass}">${text}</span>`;
}

export function escapeHtml(value) {
  return String(value)
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#039;');
}

export function formatMoney(value) {
  const amount = Number(value || 0);
  return `R${amount.toFixed(2)}`;
}

export function setActiveNav(dataKey) {
  document.querySelectorAll('.nav-link').forEach((link) => {
    if (link.dataset.nav === dataKey) {
      link.classList.add('active');
    }
  });
}

export function showBanner(id, show) {
  const el = document.querySelector(id);
  if (!el) return;
  el.classList.toggle('show', Boolean(show));
}

export function setText(id, text) {
  const el = document.querySelector(id);
  if (el) el.textContent = text;
}
