import { apiGet, clearChildren, createEl, initPortalUX, qs, renderStateCard, setActiveNav, trackPortalEvent } from '/assets/portal-shared.js';

let goalFilter = 'all';

async function loadStudentCareer(studentId) {
  const list = qs('#tutorCareerList');
  clearChildren(list);

  if (!studentId) {
    renderStateCard(list, {
      variant: 'empty',
      title: 'Student ID required',
      description: 'Enter an assigned student ID to load career goals.',
    });
    return;
  }

  try {
    const data = await apiGet(`/tutor/students/${encodeURIComponent(studentId)}/career`);

    if (!data.selectedGoals?.length) {
      renderStateCard(list, {
        variant: 'empty',
        title: 'No career goals selected',
        description: 'This student has not selected a career roadmap yet.',
      });
      return;
    }

    const selectedGoals = (data.selectedGoals || []).filter((entry) => {
      const score = Number(entry.latestSnapshot?.alignmentScore ?? 0);
      if (goalFilter === 'all') {return true;}
      if (goalFilter === 'high') {return score >= 70;}
      if (goalFilter === 'watch') {return score < 70;}
      return true;
    });

    if (!selectedGoals.length) {
      renderStateCard(list, {
        variant: 'empty',
        title: 'No goals in this filter',
        description: 'Switch filters to view all alignment bands.',
      });
      return;
    }

    const frag = document.createDocumentFragment();
    selectedGoals.forEach((entry) => {
      const row = createEl('div', { className: 'list-row' });
      row.append(
        createEl('strong', { text: entry.goal.title }),
        createEl('div', { className: 'note', text: `Alignment: ${entry.latestSnapshot?.alignmentScore ?? 0}%` }),
        createEl('div', { className: 'note', text: (entry.latestSnapshot?.reasons || []).slice(0, 2).join(' · ') || 'No reasons available.' }),
      );
      frag.append(row);
    });

    list.append(frag);
  } catch {
    renderStateCard(list, {
      variant: 'error',
      title: 'Could not load student career view',
      description: 'Verify the student is assigned to you and try again.',
    });
  }
}

function bindFilters() {
  const filterRoot = qs('#careerGoalFilters');
  filterRoot?.querySelectorAll('.filter-pill').forEach((pill) => {
    pill.addEventListener('click', () => {
      goalFilter = pill.dataset.filter || 'all';
      filterRoot.querySelectorAll('.filter-pill').forEach((item) => {
        const active = item === pill;
        item.classList.toggle('active', active);
        item.setAttribute('aria-selected', active ? 'true' : 'false');
      });
      const studentId = String(qs('#careerStudentId')?.value || '').trim();
      loadStudentCareer(studentId).catch(() => undefined);
    });
  });
}

async function initTutorCareer() {
  initPortalUX();
  setActiveNav('career');
  trackPortalEvent('tutor_career_viewed', { role: 'tutor' });

  bindFilters();

  qs('#loadCareerStudentBtn')?.addEventListener('click', () => {
    const studentId = String(qs('#careerStudentId')?.value || '').trim();
    loadStudentCareer(studentId).catch(() => undefined);
  });

  await loadStudentCareer('');
}

initTutorCareer();
