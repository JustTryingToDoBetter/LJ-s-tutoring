// Auth guard for tutor pages.
// Redirects to tutor login if not authenticated as TUTOR.
(async function () {
  const API_BASE = (window.__PO_API_BASE__ || '').replace(/\/$/, '');
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
