import { apiFetch, apiUrl } from '../common.js';

const form     = document.getElementById('loginForm');
const feedback = document.getElementById('loginFeedback');
const googleBtn = document.getElementById('googleBtn');

// Point the Google button at the API start URL
if (googleBtn) {
  googleBtn.href = apiUrl('/auth/google/start');

  // Show an error if we were redirected back from Google with ?error=
  const params = new URLSearchParams(window.location.search);
  if (params.get('error') === 'account_not_found') {
    googleBtn.closest('div').insertAdjacentHTML(
      'afterend',
      '<p class="note" style="color:var(--red,#e53e3e)">No account found for that Google address. Contact your administrator.</p>',
    );
  } else if (params.get('error') === 'wrong_role') {
    googleBtn.closest('div').insertAdjacentHTML(
      'afterend',
      '<p class="note" style="color:var(--red,#e53e3e)">That Google account is linked to another portal.</p>',
    );
  }
}

form?.addEventListener('submit', async (e) => {
  e.preventDefault();
  feedback.textContent = 'Signing in…';
  const payload = Object.fromEntries(new FormData(form).entries());

  const res = await apiFetch('/auth/login', { method: 'POST', body: payload });

  if (res.ok) {
    const body = await res.json().catch(() => ({}));
    // Ensure only tutors land here
    if (body.role && body.role !== 'TUTOR') {
      feedback.textContent = 'This portal is for tutors only.';
      return;
    }
    window.location.href = body.redirectTo || '/tutor/dashboard/';
    return;
  }

  const body = await res.json().catch(() => ({}));
  if (body.error === 'invalid_credentials') {
    feedback.textContent = 'Incorrect email or password.';
  } else if (body.error === 'rate_limited') {
    feedback.textContent = 'Too many attempts. Please wait and try again.';
  } else {
    feedback.textContent = 'Sign-in failed. Please try again.';
  }
});
