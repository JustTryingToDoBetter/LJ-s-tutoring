import { apiGet, apiPost, setActiveNav, qs, renderSkeletonCards, renderStateCard, clearChildren, createEl, initPortalUX, trackPortalEvent } from '/assets/portal-shared.js';

async function initTutorReports() {
  initPortalUX();
  setActiveNav('reports');

  const listEl = qs('#tutorReportsList');
  const studentInput = qs('#reportStudentId');

  renderSkeletonCards(listEl, 3);

  const load = async () => {
    const studentId = studentInput?.value?.trim();
    const query = studentId ? `?studentId=${encodeURIComponent(studentId)}` : '';
    const data = await apiGet(`/tutor/reports${query}`);
    clearChildren(listEl);

    if (!data.items?.length) {
      renderStateCard(listEl, {
        variant: 'empty',
        title: 'No reports found',
        description: 'Generate one for an assigned student.'
      });
      return;
    }

    const frag = document.createDocumentFragment();
    data.items.forEach((item) => {
      const row = createEl('div', { className: 'list-row' });
      row.append(
        createEl('div', { className: 'row-head' }, [
          createEl('strong', { text: `${item.student_name || 'Student'} · ${item.week_start} → ${item.week_end}` }),
          createEl('span', { className: 'note', text: new Date(item.created_at).toLocaleString() })
        ]),
        createEl('a', {
          className: 'button secondary',
          text: 'View report',
          attrs: { href: `/reports/view/?id=${encodeURIComponent(item.id)}` }
        })
      );
      frag.append(row);
    });
    listEl.append(frag);
  };

  try {
    await load();
  } catch {
    renderStateCard(listEl, {
      variant: 'error',
      title: 'Could not load reports',
      description: 'Please refresh to try again.'
    });
  }

  qs('#generateTutorReport')?.addEventListener('click', async () => {
    const studentId = studentInput?.value?.trim();
    if (!studentId) {
      renderStateCard(listEl, {
        variant: 'empty',
        title: 'Student ID required',
        description: 'Enter an assigned student ID, then generate the report.'
      });
      return;
    }

    const btn = qs('#generateTutorReport');
    btn.disabled = true;
    try {
      await apiPost('/reports/generate', { studentId });
      trackPortalEvent('report_generated', { role: 'tutor' });
      await load();
    } finally {
      btn.disabled = false;
    }
  });

  qs('#refreshTutorReports')?.addEventListener('click', () => {
    load().catch(() => {
      renderStateCard(listEl, {
        variant: 'error',
        title: 'Unable to refresh reports',
        description: 'Try again in a moment.'
      });
    });
  });
}

initTutorReports();
