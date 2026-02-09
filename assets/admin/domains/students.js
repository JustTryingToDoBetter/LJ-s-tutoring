import { apiGet, apiPost, qs, setActiveNav, escapeHtml } from '/assets/portal-shared.js';

export async function initStudents() {
  setActiveNav('students');
  const list = qs('#studentList');
  const form = qs('#studentForm');

  const load = async () => {
    const data = await apiGet('/admin/students');
    list.innerHTML = data.students
      .map((s) => `<div class="panel">
          <div><strong>${escapeHtml(s.full_name)}</strong> (${escapeHtml(s.grade || 'N/A')})</div>
          <div class="note">${escapeHtml(s.guardian_name || 'No guardian')} | ${s.active ? 'Active' : 'Inactive'}</div>
        </div>`)
      .join('');
  };

  await load();

  form.addEventListener('submit', async (event) => {
    event.preventDefault();
    const payload = {
      fullName: qs('#studentName').value,
      grade: qs('#studentGrade').value || undefined,
      guardianName: qs('#guardianName').value || undefined,
      guardianPhone: qs('#guardianPhone').value || undefined,
      notes: qs('#studentNotes').value || undefined,
      active: qs('#studentActive').checked
    };
    await apiPost('/admin/students', payload);
    form.reset();
    await load();
  });
}
