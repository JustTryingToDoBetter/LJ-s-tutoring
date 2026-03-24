// Auth guard for student dashboard pages.
// Redirects to student login if not authenticated as STUDENT.
(async function () {
  const API_BASE = (window.__PO_API_BASE__ || '').replace(/\/$/, '');
  try {
    const res = await fetch(`${API_BASE}/auth/session`, { credentials: 'include' });
    if (!res.ok) {
      throw new Error('unauthenticated');
    }
    const data = await res.json();
    if (!data?.user || data.user.role !== 'STUDENT') {
      throw new Error('wrong_role');
    }
  } catch {
    window.location.replace('/dashboard/login.html');
  }
}());
