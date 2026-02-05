import { apiGet, apiPost, apiPatch, qs, renderStatus, formatMoney, setActiveNav, escapeHtml } from '/assets/portal-shared.js';

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
          <div><strong>${escapeHtml(t.full_name)}</strong> (${escapeHtml(t.email || 'no email')})</div>
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

async function initAssignments() {
  setActiveNav('assignments');
  const list = qs('#assignmentList');
  const form = qs('#assignmentForm');

  const [tutors, students] = await Promise.all([
    apiGet('/admin/tutors'),
    apiGet('/admin/students')
  ]);

  qs('#assignmentTutor').innerHTML = tutors.tutors.map((t) => `<option value="${t.id}">${escapeHtml(t.full_name)}</option>`).join('');
  qs('#assignmentStudent').innerHTML = students.students.map((s) => `<option value="${s.id}">${escapeHtml(s.full_name)}</option>`).join('');

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
          <div><strong>${escapeHtml(s.tutor_name)}</strong> - ${escapeHtml(s.student_name)}</div>
          <div class="note">${escapeHtml(s.date)} ${escapeHtml(s.start_time)}-${escapeHtml(s.end_time)}</div>
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
  const lockBtn = qs('#lockWeek');
  const adjustmentForm = qs('#adjustmentForm');
  const adjustmentList = qs('#adjustmentList');
  const adjustmentTutor = qs('#adjustTutor');

  if (adjustmentTutor) {
    const tutors = await apiGet('/admin/tutors');
    adjustmentTutor.innerHTML = tutors.tutors
      .map((t) => `<option value="${t.id}">${escapeHtml(t.full_name)}</option>`)
      .join('');
  }

  const loadAdjustments = async (weekStart) => {
    if (!adjustmentList || !weekStart) return;
    const data = await apiGet(`/admin/pay-periods/${weekStart}/adjustments`);
    adjustmentList.innerHTML = data.adjustments.length
            ? data.adjustments.map((adj) => {
                const voided = adj.voided_at ? ' (voided)' : '';
                return `<div class="panel">
                  <div><strong>${escapeHtml(adj.tutor_name)}</strong> ${escapeHtml(adj.type)}${voided}</div>
                  <div class="note">${formatMoney(adj.signed_amount)} - ${escapeHtml(adj.reason)}</div>
                </div>`;
        }).join('')
      : '<div class="note">No adjustments yet.</div>';
  };

  form.addEventListener('submit', async (event) => {
    event.preventDefault();
    const weekStart = qs('#weekStart').value;
    const res = await apiPost('/admin/payroll/generate-week', { weekStart });
    list.innerHTML = res.invoices.length
      ? res.invoices.map((inv) => `<div class="panel">
          <div><strong>${escapeHtml(inv.invoice_number)}</strong></div>
          <div>${formatMoney(inv.total_amount)}</div>
        </div>`).join('')
      : '<div class="note">No invoices generated.</div>';

    qs('#payrollCsv').href = `/admin/payroll/week/${weekStart}.csv`;
  });

  lockBtn?.addEventListener('click', async () => {
    const weekStart = qs('#weekStart').value;
    if (!weekStart) return;
    await apiPost(`/admin/pay-periods/${weekStart}/lock`);
    alert(`Week ${weekStart} locked.`);
  });

  if (adjustmentForm) {
    adjustmentForm.addEventListener('submit', async (event) => {
      event.preventDefault();
      const weekStart = qs('#adjustWeek').value;
      const payload = {
        tutorId: qs('#adjustTutor').value,
        type: qs('#adjustType').value,
        amount: Number(qs('#adjustAmount').value),
        reason: qs('#adjustReason').value,
        relatedSessionId: qs('#adjustSession').value || undefined
      };
      await apiPost(`/admin/pay-periods/${weekStart}/adjustments`, payload);
      adjustmentForm.reset();
      await loadAdjustments(weekStart);
    });

    const weekInput = qs('#adjustWeek');
    weekInput.addEventListener('change', () => loadAdjustments(weekInput.value));
  }
}

async function initReconciliation() {
  setActiveNav('reconciliation');
  const form = qs('#reconForm');
  const status = qs('#reconStatus');
  const report = qs('#reconReport');
  const adjustmentsEl = qs('#reconAdjustments');

  const renderList = (title, items, renderItem) => {
    const content = items.length
      ? items.map(renderItem).join('')
      : '<div class="note">None found.</div>';
    return `<div class="panel">
      <div><strong>${title}</strong></div>
      <div style="margin-top:8px;">${content}</div>
    </div>`;
  };

  form.addEventListener('submit', async (event) => {
    event.preventDefault();
    report.innerHTML = '';
    adjustmentsEl.innerHTML = '';
    const weekStart = qs('#reconWeek').value;

    const [integrity, adjustments] = await Promise.all([
      apiGet(`/admin/integrity/pay-period/${weekStart}`),
      apiGet(`/admin/pay-periods/${weekStart}/adjustments`)
    ]);

    status.textContent = `Week status: ${integrity.payPeriod?.status || 'OPEN'}`;

    report.innerHTML = [
      renderList('Overlapping sessions', integrity.overlaps, (row) =>
        `<div class="note">${escapeHtml(row.session_id)} overlaps ${escapeHtml(row.overlap_id)} (${escapeHtml(row.date)} ${escapeHtml(row.start_time)}-${escapeHtml(row.end_time)})</div>`
      ),
      renderList('Outside assignment window', integrity.outsideAssignmentWindow, (row) =>
        `<div class="note">${escapeHtml(row.id)} on ${escapeHtml(row.date)} ${escapeHtml(row.start_time)}-${escapeHtml(row.end_time)}</div>`
      ),
      renderList('Approved sessions missing invoice lines', integrity.missingInvoiceLines, (row) =>
        `<div class="note">${escapeHtml(row.id)} on ${escapeHtml(row.date)}</div>`
      ),
      renderList('Invoice totals mismatched', integrity.invoiceTotalMismatches, (row) =>
        `<div class="note">${escapeHtml(row.invoice_number)} total ${formatMoney(row.total_amount)} vs lines ${formatMoney(row.line_total)}</div>`
      ),
      renderList('Pending submitted sessions', integrity.pendingSubmissions, (row) =>
        `<div class="note">${escapeHtml(row.tutor_name)}: ${row.pending}</div>`
      ),
      renderList('Duplicate sessions', integrity.duplicateSessions, (row) =>
        `<div class="note">${escapeHtml(row.tutor_id)} / ${escapeHtml(row.student_id)} on ${escapeHtml(row.date)} ${escapeHtml(row.start_time)}-${escapeHtml(row.end_time)} (x${row.count})</div>`
      )
    ].join('');

    const adjustmentItems = adjustments.adjustments || [];
    adjustmentsEl.innerHTML = renderList('Adjustments', adjustmentItems, (row) => {
      const voided = row.voided_at ? ' (voided)' : '';
      return `<div class="note">${escapeHtml(row.tutor_name)}: ${escapeHtml(row.type)} ${formatMoney(row.signed_amount)} - ${escapeHtml(row.reason)}${voided}</div>`;
    });
  });
}

const page = document.body.dataset.page;

if (page === 'dashboard') initDashboard();
if (page === 'tutors') initTutors();
if (page === 'students') initStudents();
if (page === 'assignments') initAssignments();
if (page === 'approvals') initApprovals();
if (page === 'payroll') initPayroll();
if (page === 'reconciliation') initReconciliation();
