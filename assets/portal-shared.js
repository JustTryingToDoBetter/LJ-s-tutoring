const API_BASE = window.PO_API_BASE ?? '';

async function request(path, options = {}) {
  const res = await fetch(`${API_BASE}${path}`, {
    credentials: 'include',
    headers: {
      'Content-Type': 'application/json',
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

export function qs(id) {
  return document.querySelector(id);
}

export function renderStatus(status) {
  const text = String(status || 'DRAFT').toLowerCase();
  return `<span class="pill ${text}">${text}</span>`;
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
