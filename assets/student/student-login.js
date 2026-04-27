import { apiFetch, apiUrl } from '../common.js';

const stepEmail    = document.getElementById('stepEmail');
const stepSent     = document.getElementById('stepSent');
const magicForm    = document.getElementById('magicForm');
const magicFeedback = document.getElementById('magicFeedback');
const sentMessage  = document.getElementById('sentMessage');
const resendBtn    = document.getElementById('resendBtn');
const resendFeedback = document.getElementById('resendFeedback');
const googleStudentBtn = document.getElementById('googleStudentBtn');

let lastEmail = '';

if (googleStudentBtn) {
  googleStudentBtn.href = apiUrl('/auth/google/student/start');

  const params = new URLSearchParams(window.location.search);
  const error = params.get('error');
  if (error === 'account_not_found') {
    magicFeedback.textContent = 'No student account found for that Google address. Contact your administrator.';
  } else if (error === 'wrong_role') {
    magicFeedback.textContent = 'That Google account is linked to another portal.';
  }
}

async function requestLink(email, feedbackEl) {
  const res = await apiFetch('/auth/request-link', {
    method: 'POST',
    body: { email },
  });
  const body = await res.json().catch(() => ({}));
  // API always returns ok:true to prevent email enumeration
  if (!res.ok) {
    feedbackEl.textContent = 'Something went wrong. Please try again.';
    return null;
  }
  return body;
}

magicForm?.addEventListener('submit', async (e) => {
  e.preventDefault();
  magicFeedback.textContent = 'Sending link…';
  lastEmail = magicForm.querySelector('#email').value.trim();

  const result = await requestLink(lastEmail, magicFeedback);
  if (!result) {
    return;
  }

  magicFeedback.textContent = '';
  sentMessage.textContent = `We sent a sign-in link to ${lastEmail}. Click the link to sign in.`;
  if (result.debugMagicLink) {
    sentMessage.textContent = 'Local dev mode: open this sign-in link to continue.';
    const devLink = document.createElement('a');
    devLink.className = 'button';
    devLink.href = result.debugMagicLink;
    devLink.textContent = 'Open sign-in link';
    sentMessage.after(devLink);
  }
  stepEmail.hidden = true;
  stepSent.hidden = false;
});

resendBtn?.addEventListener('click', async () => {
  resendFeedback.textContent = 'Sending again…';
  resendBtn.disabled = true;
  const result = await requestLink(lastEmail, resendFeedback);
  resendBtn.disabled = false;
  if (result) {
    resendFeedback.textContent = 'Sent! Check your inbox.';
  }
});
