import { apiGet, apiPost, qs, setActiveNav, escapeHtml, renderSkeletonCards, renderStateCard } from '/assets/portal-shared.js';

export async function initStudents() {
  setActiveNav('students');
  const list = qs('#studentList');
  const form = qs('#studentForm');
  if (!list || !form) {return;}

  let studentsCache = [];

  const toolbar = document.createElement('div');
  toolbar.className = 'ds-toolbar';
  toolbar.innerHTML = `
    <input id="studentSearch" type="search" placeholder="Search by student or guardian" aria-label="Search students">
    <select id="studentStatusFilter" aria-label="Filter students by status">
      <option value="all">All students</option>
      <option value="active">Active</option>
      <option value="inactive">Inactive</option>
    </select>
  `;
  list.parentElement?.insertBefore(toolbar, list);

  const feedback = document.createElement('p');
  feedback.id = 'studentFormFeedback';
  feedback.className = 'form-feedback';
  feedback.setAttribute('role', 'status');
  feedback.setAttribute('aria-live', 'polite');
  form.appendChild(feedback);

  const renderList = (records) => {
    if (!records.length) {
      renderStateCard(list, {
        variant: 'empty',
        title: 'No students found',
        description: 'Try a broader search or add a new student.',
      });
      return;
    }
    list.innerHTML = records
      .map((s) => `<div class="panel">
          <div><strong>${escapeHtml(s.full_name)}</strong> (${escapeHtml(s.grade || 'N/A')})</div>
          <div class="note">${escapeHtml(s.guardian_name || 'No guardian')} | ${s.active ? 'Active' : 'Inactive'}</div>
        </div>`)
      .join('');
  };

  const applyFilters = () => {
    const query = (qs('#studentSearch')?.value || '').trim().toLowerCase();
    const status = qs('#studentStatusFilter')?.value || 'all';
    const filtered = studentsCache.filter((student) => {
      const matchesSearch = !query
        || student.full_name?.toLowerCase().includes(query)
        || student.guardian_name?.toLowerCase().includes(query);
      const matchesStatus = status === 'all' || (status === 'active' ? student.active : !student.active);
      return matchesSearch && matchesStatus;
    });
    renderList(filtered);
  };

  const load = async () => {
    renderSkeletonCards(list, 4);
    try {
      const data = await apiGet('/admin/students');
      studentsCache = Array.isArray(data.students) ? data.students : [];
      applyFilters();
    } catch {
      renderStateCard(list, {
        variant: 'error',
        title: 'Unable to load students',
        description: 'Refresh and try again. If the issue persists, check API connectivity.',
      });
    }
  };

  await load();

  qs('#studentSearch')?.addEventListener('input', applyFilters);
  qs('#studentStatusFilter')?.addEventListener('change', applyFilters);

  form.addEventListener('submit', async (event) => {
    event.preventDefault();
    feedback.textContent = '';
    feedback.className = 'form-feedback';

    const studentName = qs('#studentName');
    const guardianPhone = qs('#guardianPhone');
    const phoneDigits = (guardianPhone.value || '').replace(/\D+/g, '');
    if (!studentName.value.trim()) {
      studentName.setAttribute('aria-invalid', 'true');
      feedback.textContent = 'Student name is required.';
      feedback.classList.add('error');
      return;
    }
    studentName.setAttribute('aria-invalid', 'false');
    if (phoneDigits && phoneDigits.length < 10) {
      guardianPhone.setAttribute('aria-invalid', 'true');
      feedback.textContent = 'Guardian phone must be at least 10 digits.';
      feedback.classList.add('error');
      return;
    }
    guardianPhone.setAttribute('aria-invalid', 'false');

    const payload = {
      fullName: qs('#studentName').value,
      grade: qs('#studentGrade').value || undefined,
      guardianName: qs('#guardianName').value || undefined,
      guardianPhone: qs('#guardianPhone').value || undefined,
      notes: qs('#studentNotes').value || undefined,
      active: qs('#studentActive').checked,
    };
    try {
      await apiPost('/admin/students', payload);
      feedback.textContent = 'Student created successfully.';
      feedback.classList.add('success');
      form.reset();
      await load();
    } catch (err) {
      feedback.textContent = err?.message || 'Unable to create student.';
      feedback.classList.add('error');
    }
  });
}
