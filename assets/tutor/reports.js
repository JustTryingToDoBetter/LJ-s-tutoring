import { apiGet, apiPost, setActiveNav, qs, renderSkeletonCards, renderStateCard, clearChildren, createEl, initPortalUX, trackPortalEvent } from '/assets/portal-shared.js';

async function initTutorReports() {
  initPortalUX();
  setActiveNav('reports');

  const listEl = qs('#tutorReportsList');
  const studentInput = qs('#reportStudentId');
  const filterRoot = qs('#tutorReportsFilterPills');
  let currentFilter = 'all';
  let cachedItems = [];

  renderSkeletonCards(listEl, 3);

  const load = async () => {
    const studentId = studentInput?.value?.trim();
    const query = studentId ? `?studentId=${encodeURIComponent(studentId)}` : '';
    const data = await apiGet(`/tutor/reports${query}`);
    cachedItems = data.items || [];
    const now = Date.now();
    const items = cachedItems.filter((item) => {
      if (currentFilter === 'all') {return true;}
      const createdAt = Date.parse(item.created_at || '');
      if (!Number.isFinite(createdAt)) {return false;}
      return now - createdAt <= 14 * 24 * 60 * 60 * 1000;
    });
    clearChildren(listEl);

    if (!items.length) {
      renderStateCard(listEl, {
        variant: 'empty',
        title: currentFilter === 'all' ? 'No reports found' : 'No reports in this filter',
        description: currentFilter === 'all' ? 'Generate one for an assigned student.' : 'Try a broader filter.',
      });
      return;
    }

    const frag = document.createDocumentFragment();
    items.forEach((item) => {
      const row = createEl('div', { className: 'list-row' });
      row.append(
        createEl('div', { className: 'row-head' }, [
          createEl('strong', { text: `${item.student_name || 'Student'} · ${item.week_start} → ${item.week_end}` }),
          createEl('span', { className: 'note', text: new Date(item.created_at).toLocaleString() }),
        ]),
        createEl('a', {
          className: 'button secondary',
          text: 'View report',
          attrs: { href: `/reports/view/?id=${encodeURIComponent(item.id)}` },
        }),
      );
      frag.append(row);
    });
    listEl.append(frag);
  };

  filterRoot?.querySelectorAll('.filter-pill').forEach((pill) => {
    pill.addEventListener('click', () => {
      currentFilter = pill.dataset.filter || 'all';
      filterRoot.querySelectorAll('.filter-pill').forEach((item) => {
        const active = item === pill;
        item.classList.toggle('active', active);
        item.setAttribute('aria-selected', active ? 'true' : 'false');
      });
      load().catch(() => {
        renderStateCard(listEl, {
          variant: 'error',
          title: 'Unable to refresh reports',
          description: 'Try again in a moment.',
        });
      });
    });
  });

  try {
    await load();
  } catch {
    renderStateCard(listEl, {
      variant: 'error',
      title: 'Could not load reports',
      description: 'Please refresh to try again.',
    });
  }

  qs('#generateTutorReport')?.addEventListener('click', async () => {
    const studentId = studentInput?.value?.trim();
    if (!studentId) {
      renderStateCard(listEl, {
        variant: 'empty',
        title: 'Student ID required',
        description: 'Enter an assigned student ID, then generate the report.',
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
        description: 'Try again in a moment.',
      });
    });
  });
}

initTutorReports();
