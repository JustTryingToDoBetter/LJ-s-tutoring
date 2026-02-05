import { apiGet, apiPost, apiPatch, qs, renderStatus, formatMoney, setActiveNav } from '/assets/portal-shared.js';

async function initDashboard() {
  setActiveNav('dashboard');
  const counts = await apiGet('/admin/dashboard');
  qs('#countTutors').textContent = counts.tutors;
  qs('#countStudents').textContent = counts.students;
  qs('#countSessions').textContent = counts.sessions.reduce((acc, row) => acc + Number(row.count), 0);
}

async function initTutors() {
  setActiveNav('tutors');
  const list = qs('#tutorList');
  const form = qs('#tutorForm');

  const load = async () => {
    const data = await apiGet('/admin/tutors');
    list.innerHTML = data.tutors
      .map((t) => `<div class="panel">
          <div><strong>${t.full_name}</strong> (${t.email || 'no email'})</div>
          <div class="note">${formatMoney(t.default_hourly_rate)} | ${t.active ? 'Active' : 'Inactive'}</div>
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
}

async function initStudents() {
  setActiveNav('students');
  const list = qs('#studentList');
  const form = qs('#studentForm');

  const load = async () => {
    const data = await apiGet('/admin/students');
    list.innerHTML = data.students
      .map((s) => `<div class="panel">
          <div><strong>${s.full_name}</strong> (${s.grade || 'N/A'})</div>
          <div class="note">${s.guardian_name || 'No guardian'} | ${s.active ? 'Active' : 'Inactive'}</div>
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

async function initAssignments() {
  setActiveNav('assignments');
  const list = qs('#assignmentList');
  const form = qs('#assignmentForm');

  const [tutors, students] = await Promise.all([
    apiGet('/admin/tutors'),
    apiGet('/admin/students')
  ]);

  qs('#assignmentTutor').innerHTML = tutors.tutors.map((t) => `<option value="${t.id}">${t.full_name}</option>`).join('');
  qs('#assignmentStudent').innerHTML = students.students.map((s) => `<option value="${s.id}">${s.full_name}</option>`).join('');

  const load = async () => {
    const data = await apiGet('/admin/assignments');
    list.innerHTML = data.assignments
      .map((a) => `<div class="panel">
          <div><strong>${a.subject}</strong> - ${a.student_name}</div>
          <div class="note">Tutor: ${a.tutor_name} | ${a.start_date} to ${a.end_date || 'open-ended'}</div>
        </div>`)
      .join('');
  };

  await load();

  form.addEventListener('submit', async (event) => {
    event.preventDefault();
    const allowedDays = Array.from(document.querySelectorAll('input[name="allowedDay"]:checked')).map((i) => Number(i.value));
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
    await apiPost('/admin/assignments', payload);
    form.reset();
    await load();
  });
}

async function initApprovals() {
  setActiveNav('approvals');
  const list = qs('#approvalList');

  const load = async () => {
    const data = await apiGet('/admin/sessions?status=SUBMITTED');
    list.innerHTML = data.sessions.length
      ? data.sessions.map((s) => `<div class="panel">
          <div><strong>${s.tutor_name}</strong> - ${s.student_name}</div>
          <div class="note">${s.date} ${s.start_time}-${s.end_time}</div>
          <div class="split" style="margin-top:10px;">
            <button class="button" data-approve="${s.id}">Approve</button>
            <button class="button secondary" data-reject="${s.id}">Reject</button>
          </div>
        </div>`).join('')
      : '<div class="note">No sessions pending approval.</div>';

    list.querySelectorAll('button[data-approve]').forEach((btn) => {
      btn.addEventListener('click', async () => {
        await apiPost(`/admin/sessions/${btn.dataset.approve}/approve`);
        await load();
      });
    });

    list.querySelectorAll('button[data-reject]').forEach((btn) => {
      btn.addEventListener('click', async () => {
        const reason = prompt('Reason for rejection?') || undefined;
        await apiPost(`/admin/sessions/${btn.dataset.reject}/reject`, { reason });
        await load();
      });
    });
  };

  await load();
}

async function initPayroll() {
  setActiveNav('payroll');
  const form = qs('#payrollForm');
  const list = qs('#payrollList');

  form.addEventListener('submit', async (event) => {
    event.preventDefault();
    const weekStart = qs('#weekStart').value;
    const res = await apiPost('/admin/payroll/generate-week', { weekStart });
    list.innerHTML = res.invoices.length
      ? res.invoices.map((inv) => `<div class="panel">
          <div><strong>${inv.invoice_number}</strong></div>
          <div>${formatMoney(inv.total_amount)}</div>
        </div>`).join('')
      : '<div class="note">No invoices generated.</div>';

    qs('#payrollCsv').href = `/admin/payroll/week/${weekStart}.csv`;
  });
}

const page = document.body.dataset.page;

if (page === 'dashboard') initDashboard();
if (page === 'tutors') initTutors();
if (page === 'students') initStudents();
if (page === 'assignments') initAssignments();
if (page === 'approvals') initApprovals();
if (page === 'payroll') initPayroll();
