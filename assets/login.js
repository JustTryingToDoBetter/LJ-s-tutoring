
import { apiFetch, apiUrl } from './common.js';

const form = document.getElementById('loginForm');
const feedback = document.getElementById('loginFeedback');

form?.addEventListener('submit', async (event) => {
  event.preventDefault();
  feedback.textContent = 'Signing in…';
  const formData = new FormData(form);
  const payload = Object.fromEntries(formData.entries());
  const res = await apiFetch('/auth/login', { method: 'POST', body: payload });
  if (res.redirected) {
    window.location.href = res.url;
    return;
  }
  if (res.ok) {
    const body = await res.json().catch(() => ({}));
    window.location.href = body.redirectTo || apiUrl('/auth/session');
    return;
  }
  const body = await res.json().catch(() => ({}));
  feedback.textContent = body.error || 'Login failed.';
});
