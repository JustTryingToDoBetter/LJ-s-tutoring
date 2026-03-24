import { apiFetch } from '../common.js';

const stepPassword    = document.getElementById('stepPassword');
const stepOtp         = document.getElementById('stepOtp');
const passwordForm    = document.getElementById('passwordForm');
const otpForm         = document.getElementById('otpForm');
const passwordFeedback = document.getElementById('passwordFeedback');
const otpFeedback     = document.getElementById('otpFeedback');

// Step 1 — email + password
passwordForm?.addEventListener('submit', async (e) => {
  e.preventDefault();
  passwordFeedback.textContent = 'Checking credentials…';
  const data = Object.fromEntries(new FormData(passwordForm).entries());

  const res = await apiFetch('/auth/admin/login', { method: 'POST', body: data });
  const body = await res.json().catch(() => ({}));

  if (!res.ok) {
    passwordFeedback.textContent = body.error === 'invalid_credentials'
      ? 'Incorrect email or password.'
      : body.error === 'rate_limited'
      ? 'Too many attempts. Please wait and try again.'
      : 'Sign-in failed. Please try again.';
    return;
  }

  // Advance to OTP step
  passwordFeedback.textContent = '';
  stepPassword.hidden = true;
  stepOtp.hidden = false;
  document.getElementById('otpCode')?.focus();
});

// Step 2 — OTP code
otpForm?.addEventListener('submit', async (e) => {
  e.preventDefault();
  otpFeedback.textContent = 'Verifying code…';
  const data = Object.fromEntries(new FormData(otpForm).entries());

  const res = await apiFetch('/auth/admin/verify-otp', { method: 'POST', body: data });
  const body = await res.json().catch(() => ({}));

  if (!res.ok) {
    otpFeedback.textContent = body.error === 'invalid_or_expired_code'
      ? 'Incorrect or expired code. Check your email and try again.'
      : body.error === 'rate_limited'
      ? 'Too many attempts. Please wait.'
      : body.error === 'mfa_session_missing' || body.error === 'mfa_session_invalid'
      ? 'Session expired. Please start again.'
      : 'Verification failed. Please try again.';

    if (body.error === 'mfa_session_missing' || body.error === 'mfa_session_invalid') {
      setTimeout(() => {
        stepOtp.hidden = true;
        stepPassword.hidden = false;
        otpFeedback.textContent = '';
      }, 2000);
    }
    return;
  }

  window.location.href = body.redirectTo || '/admin/';
});
