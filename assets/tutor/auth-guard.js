// Auth guard for tutor pages.
// Redirects to tutor login if not authenticated as TUTOR.
(async function () {
  function resolveApiBase() {
    const raw = String(window.__PO_API_BASE__ || '').replace(/\/$/, '');
    const host = window.location.hostname;
    const isLocalHost = (value) => value === 'localhost' || value === '127.0.0.1';

    if (!raw || raw === '__PO_API_BASE__') {
      if (isLocalHost(host)) {
        return `${window.location.protocol}//${host}:3001`;
      }
      return '/api';
    }

    if (isLocalHost(host) && raw === '/api') {
      return `${window.location.protocol}//${host}:3001`;
    }

    try {
      const parsed = new URL(raw);
      if (isLocalHost(host) && isLocalHost(parsed.hostname) && parsed.hostname !== host) {
        parsed.hostname = host;
        return parsed.toString().replace(/\/$/, '');
      }
    } catch {
      // Keep raw value if parsing fails.
    }

    return raw;
  }

  const API_BASE = resolveApiBase();
  try {
    const res = await fetch(`${API_BASE}/auth/session`, { credentials: 'include' });
    if (!res.ok) {
      throw new Error('unauthenticated');
    }
    const data = await res.json();
    if (!data?.user || data.user.role !== 'TUTOR') {
      throw new Error('wrong_role');
    }
  } catch {
    window.location.replace('/tutor/login.html');
  }
}());
