import { apiGet, apiPost, qs, setActiveNav, escapeHtml, renderSkeletonCards, renderStateCard } from '/assets/portal-shared.js';

export async function initAssignments() {
  setActiveNav('assignments');
  const list = qs('#assignmentList');
  const form = qs('#assignmentForm');
  const formError = qs('#assignmentFormError');
  if (!list || !form) {return;}

  let assignmentsCache = [];

  const toolbar = document.createElement('div');
  toolbar.className = 'ds-toolbar';
  toolbar.innerHTML = '<input id="assignmentSearch" type="search" placeholder="Search assignment by student, tutor, or subject" aria-label="Search assignments">';
  list.parentElement?.insertBefore(toolbar, list);

  const capsSubjects = [
    'Mathematics',
    'Mathematical Literacy',
    'Physical Sciences',
    'Life Sciences',
    'Accounting',
    'English Home Language',
    'Afrikaans Home Language',
  ];

  const subjectList = qs('#capsSubjects');
  if (subjectList) {
    subjectList.innerHTML = capsSubjects
      .map((subject) => `<option value="${escapeHtml(subject)}"></option>`)
      .join('');
  }

  const [tutors, students] = await Promise.all([
    apiGet('/admin/tutors'),
    apiGet('/admin/students'),
  ]);

  qs('#assignmentTutor').innerHTML = tutors.tutors
    .map((t) => `<option value="${t.id}">${escapeHtml(t.full_name)}</option>`)
    .join('');
  qs('#assignmentStudent').innerHTML = students.students
    .map((s) => `<option value="${s.id}">${escapeHtml(s.full_name)}</option>`)
    .join('');

  const renderList = (items) => {
    if (!items.length) {
      renderStateCard(list, {
        variant: 'empty',
        title: 'No assignments match',
        description: 'Try a different search term or create a new assignment.',
      });
      return;
    }
    list.innerHTML = items
      .map((a) => `<div class="panel">
          <div><strong>${escapeHtml(a.subject)}</strong> - ${escapeHtml(a.student_name)}</div>
          <div class="note">Tutor: ${escapeHtml(a.tutor_name)} | ${escapeHtml(a.start_date)} to ${escapeHtml(a.end_date || 'open-ended')}</div>
        </div>`)
      .join('');
  };

  const applyFilter = () => {
    const query = (qs('#assignmentSearch')?.value || '').trim().toLowerCase();
    const filtered = assignmentsCache.filter((a) => {
      if (!query) {return true;}
      return [a.subject, a.student_name, a.tutor_name]
        .filter(Boolean)
        .some((value) => String(value).toLowerCase().includes(query));
    });
    renderList(filtered);
  };

  const load = async () => {
    renderSkeletonCards(list, 3);
    try {
      const data = await apiGet('/admin/assignments');
      assignmentsCache = Array.isArray(data.assignments) ? data.assignments : [];
      applyFilter();
    } catch {
      renderStateCard(list, {
        variant: 'error',
        title: 'Unable to load assignments',
        description: 'Refresh and try again.',
      });
    }
  };

  await load();
  qs('#assignmentSearch')?.addEventListener('input', applyFilter);

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
        { start: qs('#rangeStart').value, end: qs('#rangeEnd').value },
      ],
    };
    if (!payload.subject?.trim()) {
      formError.textContent = 'Subject is required.';
      qs('#assignmentSubject')?.setAttribute('aria-invalid', 'true');
      return;
    }
    qs('#assignmentSubject')?.setAttribute('aria-invalid', 'false');
    if (!payload.startDate) {
      formError.textContent = 'Start date is required.';
      qs('#assignmentStart')?.setAttribute('aria-invalid', 'true');
      return;
    }
    qs('#assignmentStart')?.setAttribute('aria-invalid', 'false');
    try {
      await apiPost('/admin/assignments', payload);
      form.reset();
      formError.textContent = 'Assignment created successfully.';
      await load();
    } catch (err) {
      const message = err?.message || 'Unable to create assignment.';
      formError.textContent = message.replace(/_/g, ' ');
    }
  });
}
