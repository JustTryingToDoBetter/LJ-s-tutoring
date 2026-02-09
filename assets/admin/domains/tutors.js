import { apiGet, apiPost, qs, formatMoney, setActiveNav, escapeHtml, setImpersonationContext } from '/assets/portal-shared.js';

export async function initTutors() {
  setActiveNav('tutors');
  const list = qs('#tutorList');
  const form = qs('#tutorForm');

  const load = async () => {
    const data = await apiGet('/admin/tutors');
    list.innerHTML = data.tutors
      .map((t) => `<div class="panel">
          <div><strong>${escapeHtml(t.full_name)}</strong> (${escapeHtml(t.email || 'no email')})</div>
          <div class="note">${formatMoney(t.default_hourly_rate)} | ${t.active ? 'Active' : 'Inactive'}</div>
          <div class="split" style="margin-top:10px;">
            <button class="button secondary" data-impersonate="${t.id}" data-name="${escapeHtml(t.full_name)}">View as tutor (read-only)</button>
          </div>
        </div>`)
      .join('');
  };

  await load();

  form.addEventListener('submit', async (event) => {
    event.preventDefault();
    const payload = {
      email: qs('#tutorEmail').value,
      fullName: qs('#tutorName').value,
      phone: qs('#tutorPhone').value || undefined,
      defaultHourlyRate: Number(qs('#tutorRate').value),
      active: qs('#tutorActive').checked
    };
    await apiPost('/admin/tutors', payload);
    form.reset();
    await load();
  });

  list.addEventListener('click', async (event) => {
    const target = event.target;
    if (!target?.dataset?.impersonate) return;
    target.disabled = true;
    try {
      const res = await apiPost('/admin/impersonate/start', { tutorId: target.dataset.impersonate });
      setImpersonationContext({
        tutorId: res.tutor.id,
        tutorName: res.tutor.name,
        impersonationId: res.impersonationId
      });
      window.location.href = '/tutor/index.html';
    } finally {
      target.disabled = false;
    }
  });
}
