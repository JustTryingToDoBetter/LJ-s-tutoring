const API_BASE = (window.PO_API_BASE || window.__PO_API_BASE__ || 'http://localhost:3001').replace(/\/$/, '');
const IMPERSONATION_KEY = 'impersonationToken';
const IMPERSONATION_META_KEY = 'impersonationMeta';

function getImpersonationToken() {
  return localStorage.getItem(IMPERSONATION_KEY) || '';
}

export function getImpersonationMeta() {
  const raw = localStorage.getItem(IMPERSONATION_META_KEY);
  if (!raw) return null;
  try {
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

export function setImpersonationContext(context) {
  if (!context?.token) return;
  localStorage.setItem(IMPERSONATION_KEY, context.token);
  localStorage.setItem(IMPERSONATION_META_KEY, JSON.stringify({
    tutorId: context.tutorId,
    tutorName: context.tutorName,
    impersonationId: context.impersonationId,
    startedAt: new Date().toISOString()
  }));
}

export function clearImpersonationContext() {
  localStorage.removeItem(IMPERSONATION_KEY);
  localStorage.removeItem(IMPERSONATION_META_KEY);
}

async function request(path, options = {}) {
  const method = String(options.method || 'GET').toUpperCase();
  const csrfToken = getCookie('csrf');
  const impersonationToken = getImpersonationToken();
  if (impersonationToken && !['GET', 'HEAD'].includes(method) && path.startsWith('/tutor/')) {
    throw new Error('impersonation_read_only');
  }
  const res = await fetch(`${API_BASE}${path}`, {
    credentials: 'include',
    headers: {
      'Content-Type': 'application/json',
      ...(csrfToken && !['GET', 'HEAD'].includes(method)
        ? { 'X-CSRF-Token': csrfToken }
        : {}),
      ...(impersonationToken && path.startsWith('/tutor/')
        ? { 'X-Impersonation-Token': impersonationToken }
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
  const text = escapeHtml(raw.toLowerCase().replace(/_/g, ' '));
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
