// Auth guard for admin pages.
// Runs before page content is shown — redirects to login if not authenticated as ADMIN.
(async function () {
  const API_BASE = (window.__PO_API_BASE__ || '').replace(/\/$/, '');
  try {
    const res = await fetch(`${API_BASE}/auth/session`, { credentials: 'include' });
    if (!res.ok) throw new Error('unauthenticated');
    const data = await res.json();
    if (!data?.user || data.user.role !== 'ADMIN') throw new Error('wrong_role');
  } catch {
    window.location.replace('/admin/login.html');
  }
}());
