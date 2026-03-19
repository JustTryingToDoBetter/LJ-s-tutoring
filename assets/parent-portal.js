import { apiGet, apiPost, clearChildren, createEl, initPortalUX, qs, renderSkeletonCards, renderStateCard, setActiveNav, trackPortalEvent } from '/assets/portal-shared.js';

let selectedStudentId = null;

function renderOverview(container, overview) {
  clearChildren(container);
  const card = createEl('div', { className: 'list-row' });
  card.append(
    createEl('p', { text: `Linked students: ${overview?.linkedStudents || 0}` }),
    createEl('p', { text: `Reports this month: ${overview?.reportsThisMonth || 0}` })
  );
  container.append(card);
}

function renderStudentList(container, items, onSelect) {
  clearChildren(container);
  if (!items.length) {
    renderStateCard(container, {
      variant: 'empty',
      title: 'No linked students yet',
      description: 'Accept an invite token to connect your child profile.'
    });
    return;
  }

  const frag = document.createDocumentFragment();
  items.forEach((item) => {
    const row = createEl('div', { className: 'list-row' });
    row.append(
      createEl('strong', { text: item.full_name }),
      createEl('p', { className: 'note', text: `${item.grade || 'Grade N/A'} · ${item.relationship || 'Guardian'}` }),
      createEl('p', { className: 'note', text: item.latest_report_created_at ? `Latest report: ${new Date(item.latest_report_created_at).toLocaleDateString()}` : 'No report yet' })
    );

    const button = createEl('button', {
      className: `button secondary${selectedStudentId === item.id ? ' active' : ''}`,
      text: 'View',
      attrs: { type: 'button' }
    });
    button.addEventListener('click', () => onSelect(item.id));
    row.append(button);
    frag.append(row);
  });
  container.append(frag);
}

function renderStudentDetail(container, payload) {
  clearChildren(container);
  if (!payload?.student) {
    renderStateCard(container, {
      variant: 'empty',
      title: 'Select a student',
      description: 'Choose a linked student to see their latest status.'
    });
    return;
  }

  const report = payload.latestReport;
  const summary = payload.sessionSummary || {};

  const card = createEl('div', { className: 'list-row' });
  card.append(
    createEl('strong', { text: payload.student.full_name }),
    createEl('p', { className: 'note', text: `${payload.student.grade || 'Grade N/A'} · ${payload.student.relationship || 'Guardian'}` }),
    createEl('p', { text: `Approved sessions: ${summary.approved_sessions || 0}` }),
    createEl('p', { text: `Study minutes: ${summary.approved_minutes || 0}` }),
    createEl('p', { className: 'note', text: summary.last_session_date ? `Last session: ${new Date(summary.last_session_date).toLocaleDateString()}` : 'No sessions logged yet' })
  );

  if (report) {
    card.append(
      createEl('a', {
        className: 'button secondary',
        text: 'Open latest report',
        attrs: { href: `/reports/view/?id=${encodeURIComponent(report.id)}` }
      })
    );
  }

  container.append(card);
}

async function initParentPage() {
  setActiveNav('parent');
  initPortalUX();

  const overviewEl = qs('#parentOverview');
  const studentsEl = qs('#parentStudents');
  const detailEl = qs('#studentDetail');
  const acceptForm = qs('#acceptInviteForm');
  const inviteInput = qs('#inviteTokenInput');
  const inviteMessage = qs('#inviteMessage');

  renderSkeletonCards(overviewEl, 1);
  renderSkeletonCards(studentsEl, 2);
  renderSkeletonCards(detailEl, 1);

  const refresh = async () => {
    try {
      const [overviewData, studentsData] = await Promise.all([
        apiGet('/parent'),
        apiGet('/parent/students')
      ]);
      trackPortalEvent('parent_portal_viewed');

      const items = studentsData.items || [];
      renderOverview(overviewEl, overviewData.overview);

      const selectStudent = async (studentId) => {
        selectedStudentId = studentId;
        try {
          const detail = await apiGet(`/parent/students/${encodeURIComponent(studentId)}`);
          qs('#studentDetailTitle').textContent = `Student details · ${detail.student?.full_name || 'Student'}`;
          renderStudentDetail(detailEl, detail);
          renderStudentList(studentsEl, items, selectStudent);
        } catch {
          renderStateCard(detailEl, {
            variant: 'error',
            title: 'Could not load student details',
            description: 'Please try selecting again.'
          });
        }
      };

      renderStudentList(studentsEl, items, selectStudent);
      if (!selectedStudentId && items[0]?.id) {
        await selectStudent(items[0].id);
      } else if (selectedStudentId) {
        await selectStudent(selectedStudentId);
      }
    } catch {
      renderStateCard(overviewEl, {
        variant: 'error',
        title: 'Could not load parent overview',
        description: 'Please refresh and try again.'
      });
      renderStateCard(studentsEl, {
        variant: 'error',
        title: 'Could not load students',
        description: 'Please refresh and try again.'
      });
      renderStateCard(detailEl, {
        variant: 'error',
        title: 'Could not load details',
        description: 'Please refresh and try again.'
      });
    }
  };

  acceptForm?.addEventListener('submit', async (event) => {
    event.preventDefault();
    inviteMessage.textContent = '';
    const token = inviteInput.value.trim();
    if (!token) return;

    const submitBtn = acceptForm.querySelector('button[type="submit"]');
    submitBtn.disabled = true;
    try {
      await apiPost('/parent/invites/accept', { token });
      trackPortalEvent('parent_invite_accepted');
      inviteMessage.textContent = 'Invite accepted. Linked student list updated.';
      inviteInput.value = '';
      await refresh();
    } catch (err) {
      inviteMessage.textContent = err?.message || 'Unable to accept invite token.';
    } finally {
      submitBtn.disabled = false;
    }
  });

  await refresh();
}

initParentPage();
