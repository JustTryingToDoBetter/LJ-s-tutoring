import { apiGet, apiPost, qs, formatMoney, setActiveNav, escapeHtml, setImpersonationContext, renderSkeletonCards, renderStateCard } from '/assets/portal-shared.js';

export async function initTutors() {
  setActiveNav('tutors');
  const list = qs('#tutorList');
  const form = qs('#tutorForm');
  const formError = qs('#tutorFormError');
  if (!list || !form || !formError) {return;}

  let tutorsCache = [];

  const toolbar = document.createElement('div');
  toolbar.className = 'ds-toolbar';
  toolbar.innerHTML = `
    <input id="tutorSearch" type="search" placeholder="Search by tutor, email, or subject" aria-label="Search tutors">
    <select id="tutorStatusFilter" aria-label="Filter tutors by active status">
      <option value="all">All tutors</option>
      <option value="active">Active</option>
      <option value="inactive">Inactive</option>
    </select>
  `;
  list.parentElement?.insertBefore(toolbar, list);

  const normalizeSubjects = (raw) => {
    if (!raw) {return [];}
    if (Array.isArray(raw)) {return raw;}
    if (typeof raw === 'string') {
      try {
        const parsed = JSON.parse(raw);
        return Array.isArray(parsed) ? parsed : [];
      } catch {
        return [];
      }
    }
    return [];
  };

  const renderList = (items) => {
    if (!items.length) {
      renderStateCard(list, {
        variant: 'empty',
        title: 'No tutors match',
        description: 'Try another filter or create a tutor profile.',
      });
      return;
    }
    list.innerHTML = items
      .map((t) => `<div class="panel">
          <div><strong>${escapeHtml(t.full_name)}</strong> (${escapeHtml(t.email || 'no email')})</div>
          <div class="note">${formatMoney(t.default_hourly_rate)} | ${t.active ? 'Active' : 'Inactive'} | ${escapeHtml(t.status || 'UNKNOWN')}</div>
          <div class="note">${escapeHtml(t.qualification_band || 'n/a')} | ${escapeHtml(normalizeSubjects(t.qualified_subjects_json).join(', ') || 'No subjects')}</div>
          <div class="split" style="margin-top:10px;">
            <button class="button secondary" data-impersonate="${t.id}" data-name="${escapeHtml(t.full_name)}">View as tutor (read-only)</button>
          </div>
        </div>`)
      .join('');
  };

  const applyFilter = () => {
    const query = (qs('#tutorSearch')?.value || '').trim().toLowerCase();
    const status = qs('#tutorStatusFilter')?.value || 'all';
    const filtered = tutorsCache.filter((tutor) => {
      const subjects = normalizeSubjects(tutor.qualified_subjects_json).join(' ').toLowerCase();
      const matchesQuery = !query
        || tutor.full_name?.toLowerCase().includes(query)
        || tutor.email?.toLowerCase().includes(query)
        || subjects.includes(query);
      const matchesStatus = status === 'all' || (status === 'active' ? tutor.active : !tutor.active);
      return matchesQuery && matchesStatus;
    });
    renderList(filtered);
  };

  const load = async () => {
    renderSkeletonCards(list, 4);
    try {
      const data = await apiGet('/admin/tutors');
      tutorsCache = Array.isArray(data.tutors) ? data.tutors : [];
      applyFilter();
    } catch {
      renderStateCard(list, {
        variant: 'error',
        title: 'Unable to load tutors',
        description: 'Refresh and try again.',
      });
    }
  };

  await load();
  qs('#tutorSearch')?.addEventListener('input', applyFilter);
  qs('#tutorStatusFilter')?.addEventListener('change', applyFilter);

  form.addEventListener('submit', async (event) => {
    event.preventDefault();
    formError.textContent = '';
    const selectedSubjects = Array.from(document.querySelectorAll('input[name="qualifiedSubject"]:checked'))
      .map((input) => input.value.trim())
      .filter(Boolean);
    if (!selectedSubjects.length) {
      formError.textContent = 'Select at least one qualified subject.';
      return;
    }
    const payload = {
      email: qs('#tutorEmail').value,
      fullName: qs('#tutorName').value,
      phone: qs('#tutorPhone').value || undefined,
      defaultHourlyRate: Number(qs('#tutorRate').value),
      active: qs('#tutorActive').checked,
      status: qs('#tutorStatus').value,
      qualificationBand: qs('#tutorBand').value,
      qualifiedSubjects: selectedSubjects,
    };
    try {
      await apiPost('/admin/tutors', payload);
      form.reset();
      formError.className = 'form-feedback success';
      formError.textContent = 'Tutor created successfully.';
      await load();
    } catch (err) {
      formError.className = 'form-feedback error';
      formError.textContent = err?.message || 'Unable to create tutor.';
    }
  });

  list.addEventListener('click', async (event) => {
    const target = event.target;
    if (!target?.dataset?.impersonate) {return;}
    target.disabled = true;
    try {
      const res = await apiPost('/admin/impersonate/start', { tutorId: target.dataset.impersonate });
      setImpersonationContext({
        tutorId: res.tutor.id,
        tutorName: res.tutor.name,
        impersonationId: res.impersonationId,
      });
      window.location.href = '/tutor/index.html';
    } finally {
      target.disabled = false;
    }
  });
}
