import { apiGet, apiPost, qs, setActiveNav, escapeHtml } from '/assets/portal-shared.js';

export async function initAssignments() {
  setActiveNav('assignments');
  const list = qs('#assignmentList');
  const form = qs('#assignmentForm');
  const formError = qs('#assignmentFormError');

  const capsSubjects = [
    'Mathematics',
    'Mathematical Literacy',
    'Physical Sciences',
    'Life Sciences',
    'Accounting',
    'English Home Language',
    'Afrikaans Home Language'
  ];

  const subjectList = qs('#capsSubjects');
  if (subjectList) {
    subjectList.innerHTML = capsSubjects
      .map((subject) => `<option value="${escapeHtml(subject)}"></option>`)
      .join('');
  }

  const [tutors, students] = await Promise.all([
    apiGet('/admin/tutors'),
    apiGet('/admin/students')
  ]);

  qs('#assignmentTutor').innerHTML = tutors.tutors
    .map((t) => `<option value="${t.id}">${escapeHtml(t.full_name)}</option>`)
    .join('');
  qs('#assignmentStudent').innerHTML = students.students
    .map((s) => `<option value="${s.id}">${escapeHtml(s.full_name)}</option>`)
    .join('');

  const load = async () => {
    const data = await apiGet('/admin/assignments');
    list.innerHTML = data.assignments
      .map((a) => `<div class="panel">
          <div><strong>${escapeHtml(a.subject)}</strong> - ${escapeHtml(a.student_name)}</div>
          <div class="note">Tutor: ${escapeHtml(a.tutor_name)} | ${escapeHtml(a.start_date)} to ${escapeHtml(a.end_date || 'open-ended')}</div>
        </div>`)
      .join('');
  };

  await load();

  form.addEventListener('submit', async (event) => {
    event.preventDefault();
    formError.textContent = '';
    const allowedDays = Array.from(document.querySelectorAll('input[name="allowedDay"]:checked'))
      .map((i) => Number(i.value));
    const payload = {
      tutorId: qs('#assignmentTutor').value,
      studentId: qs('#assignmentStudent').value,
      subject: qs('#assignmentSubject').value,
      startDate: qs('#assignmentStart').value,
      endDate: qs('#assignmentEnd').value || null,
      rateOverride: qs('#assignmentRate').value ? Number(qs('#assignmentRate').value) : null,
      allowedDays,
      allowedTimeRanges: [
        { start: qs('#rangeStart').value, end: qs('#rangeEnd').value }
      ]
    };
    try {
      await apiPost('/admin/assignments', payload);
      form.reset();
      await load();
    } catch (err) {
      const message = err?.message || 'Unable to create assignment.';
      formError.textContent = message.replace(/_/g, ' ');
    }
  });
}
