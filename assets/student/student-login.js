import { apiFetch } from '../common.js';

const stepEmail    = document.getElementById('stepEmail');
const stepSent     = document.getElementById('stepSent');
const magicForm    = document.getElementById('magicForm');
const magicFeedback = document.getElementById('magicFeedback');
const sentMessage  = document.getElementById('sentMessage');
const resendBtn    = document.getElementById('resendBtn');
const resendFeedback = document.getElementById('resendFeedback');

let lastEmail = '';

async function requestLink(email, feedbackEl) {
  const res = await apiFetch('/auth/request-link', {
    method: 'POST',
    body: { email }
  });
  // API always returns ok:true to prevent email enumeration
  if (!res.ok) {
    feedbackEl.textContent = 'Something went wrong. Please try again.';
    return false;
  }
  return true;
}

magicForm?.addEventListener('submit', async (e) => {
  e.preventDefault();
  magicFeedback.textContent = 'Sending link…';
  lastEmail = magicForm.querySelector('#email').value.trim();

  const ok = await requestLink(lastEmail, magicFeedback);
  if (!ok) return;

  magicFeedback.textContent = '';
  sentMessage.textContent = `We sent a sign-in link to ${lastEmail}. Click the link to sign in.`;
  stepEmail.hidden = true;
  stepSent.hidden = false;
});

resendBtn?.addEventListener('click', async () => {
  resendFeedback.textContent = 'Sending again…';
  resendBtn.disabled = true;
  const ok = await requestLink(lastEmail, resendFeedback);
  resendBtn.disabled = false;
  if (ok) resendFeedback.textContent = 'Sent! Check your inbox.';
});
