function resolveApiBase() {
  const raw = window.__PO_API_BASE__;
  if (!raw || raw === '__PO_API_BASE__') {
    const host = window.location.hostname;
    if (host === 'localhost' || host === '127.0.0.1') {
      return 'http://localhost:3001';
    }
    throw new Error('api_base_missing');
  }
  return String(raw).replace(/\/$/, '');
}

const API_BASE = resolveApiBase();
const IMPERSONATION_META_KEY = 'impersonationMeta';

export function getImpersonationMeta() {
  const raw = localStorage.getItem(IMPERSONATION_META_KEY);
  if (!raw) {return null;}
  try {
    const meta = JSON.parse(raw);
    const startedAt = meta?.startedAt ? Date.parse(meta.startedAt) : NaN;
    if (Number.isFinite(startedAt)) {
      const maxAgeMs = 10 * 60 * 1000;
      if (Date.now() - startedAt > maxAgeMs) {
        localStorage.removeItem(IMPERSONATION_META_KEY);
        return null;
      }
    }
    return meta;
  } catch {
    return null;
  }
}

export function setImpersonationContext(context) {
  if (!context?.impersonationId) {return;}
  localStorage.setItem(IMPERSONATION_META_KEY, JSON.stringify({
    tutorId: context.tutorId,
    tutorName: context.tutorName,
    impersonationId: context.impersonationId,
    startedAt: new Date().toISOString(),
  }));
}

export function clearImpersonationContext() {
  localStorage.removeItem(IMPERSONATION_META_KEY);
}

async function request(path, options = {}) {
  const method = String(options.method || 'GET').toUpperCase();
  const csrfToken = getCookie('csrf');
  const impersonationMeta = getImpersonationMeta();
  if (impersonationMeta && !['GET', 'HEAD'].includes(method) && path.startsWith('/tutor/')) {
    throw new Error('impersonation_read_only');
  }
  const res = await fetch(`${API_BASE}${path}`, {
    credentials: 'include',
    headers: {
      'Content-Type': 'application/json',
      ...(csrfToken && !['GET', 'HEAD'].includes(method)
        ? { 'X-CSRF-Token': csrfToken }
        : {}),
      ...(options.headers || {}),
    },
    ...options,
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
    body: JSON.stringify(payload || {}),
  });
}

export function apiPatch(path, payload) {
  return request(path, {
    method: 'PATCH',
    body: JSON.stringify(payload || {}),
  });
}

export function trackPortalEvent(eventName, params = {}) {
  if (typeof window.gtag === 'function') {
    window.gtag('event', eventName, params);
  }
}

function getCookie(name) {
  const parts = document.cookie.split(';');
  for (const part of parts) {
    const [key, ...rest] = part.trim().split('=');
    if (key === name) {return rest.join('=');}
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

export function renderStatusEl(status) {
  const raw = String(status || 'DRAFT');
  const text = raw.toLowerCase().replace(/_/g, ' ');
  const safeClass = raw.toLowerCase().replace(/[^a-z0-9_-]/g, '');
  return createEl('span', { className: `pill ${safeClass}`, text });
}

export function createEl(tag, options = {}, children = []) {
  const el = document.createElement(tag);
  if (options.className) {el.className = options.className;}
  if (options.text !== null && options.text !== undefined) {
    el.textContent = String(options.text);
  }
  if (options.attrs) {
    Object.entries(options.attrs).forEach(([key, value]) => {
      if (value === null || value === undefined) {return;}
      el.setAttribute(key, String(value));
    });
  }
  if (options.dataset) {
    Object.entries(options.dataset).forEach(([key, value]) => {
      if (value === null || value === undefined) {return;}
      el.dataset[key] = String(value);
    });
  }
  if (Array.isArray(children)) {
    children.forEach((child) => {
      if (child === null || child === undefined) {return;}
      el.append(child);
    });
  }
  return el;
}

export function clearChildren(el) {
  if (!el) {return;}
  el.replaceChildren();
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
      link.setAttribute('aria-current', 'page');
    } else {
      link.removeAttribute('aria-current');
    }
  });
}

export function renderSkeletonCards(container, count = 3) {
  if (!container) {return;}
  const amount = Math.max(1, Number(count) || 1);
  container.innerHTML = Array.from({ length: amount })
    .map(() => '<div class="ds-skeleton-card" aria-hidden="true"></div>')
    .join('');
}

export function renderStateCard(container, { variant = 'empty', title = '', description = '' } = {}) {
  if (!container) {return;}
  const card = createEl('div', {
    className: `ds-state ds-state-${variant}`,
    attrs: {
      role: variant === 'error' ? 'alert' : 'status',
      'aria-live': variant === 'error' ? 'assertive' : 'polite'
    }
  });
  card.append(
    createEl('h3', { className: 'ds-state-title', text: title || 'No data yet' }),
    createEl('p', { className: 'ds-state-description', text: description || 'Try again in a moment.' })
  );
  container.replaceChildren(card);
}

export function initPortalUX() {
  const pageHeader = document.querySelector('.page-header');
  const titleEl = pageHeader?.querySelector('.page-title');
  if (pageHeader && titleEl && !pageHeader.querySelector('.portal-breadcrumbs')) {
    const path = window.location.pathname;
    const page = document.body?.dataset?.page || 'dashboard';
    const area = path.startsWith('/admin/')
      ? 'Admin'
      : (path.startsWith('/tutor/') ? 'Tutor' : 'Student');
    const labels = {
      home: 'Home',
      tutors: 'Tutors',
      students: 'Students',
      assignments: 'Assignments',
      approvals: 'Approvals',
      payroll: 'Payroll',
      reconciliation: 'Reconciliation',
      audit: 'Audit',
      retention: 'Retention',
      'privacy-requests': 'Privacy requests',
      'ops-runbook': 'Ops runbook',
      sessions: 'Sessions',
      invoices: 'Invoices',
      login: 'Login',
      dashboard: 'Dashboard',
      reports: 'Reports',
      report: 'Report'
    };
    const currentLabel = labels[page] || page;
    const nav = createEl('nav', {
      className: 'portal-breadcrumbs',
      attrs: { 'aria-label': 'Breadcrumb' }
    });
    nav.append(
      createEl('span', { className: 'portal-breadcrumbs-item', text: area }),
      createEl('span', { className: 'portal-breadcrumbs-sep', text: '/' }),
      createEl('span', {
        className: 'portal-breadcrumbs-item current',
        attrs: { 'aria-current': 'page' },
        text: currentLabel
      })
    );
    pageHeader.insertBefore(nav, titleEl);
  }
}

export function showBanner(id, show) {
  const el = document.querySelector(id);
  if (!el) {return;}
  el.classList.toggle('show', Boolean(show));
}

export function setText(id, text) {
  const el = document.querySelector(id);
  if (el) {el.textContent = text;}
}
