import { apiGet, clearChildren, createEl, initPortalUX, qs, renderStateCard, setActiveNav, trackPortalEvent } from '/assets/portal-shared.js';

async function loadStudentCareer(studentId) {
  const list = qs('#tutorCareerList');
  clearChildren(list);

  if (!studentId) {
    renderStateCard(list, {
      variant: 'empty',
      title: 'Student ID required',
      description: 'Enter an assigned student ID to load career goals.'
    });
    return;
  }

  try {
    const data = await apiGet(`/tutor/students/${encodeURIComponent(studentId)}/career`);

    if (!data.selectedGoals?.length) {
      renderStateCard(list, {
        variant: 'empty',
        title: 'No career goals selected',
        description: 'This student has not selected a career roadmap yet.'
      });
      return;
    }

    const frag = document.createDocumentFragment();
    data.selectedGoals.forEach((entry) => {
      const row = createEl('div', { className: 'list-row' });
      row.append(
        createEl('strong', { text: entry.goal.title }),
        createEl('div', { className: 'note', text: `Alignment: ${entry.latestSnapshot?.alignmentScore ?? 0}%` }),
        createEl('div', { className: 'note', text: (entry.latestSnapshot?.reasons || []).slice(0, 2).join(' · ') || 'No reasons available.' })
      );
      frag.append(row);
    });

    list.append(frag);
  } catch {
    renderStateCard(list, {
      variant: 'error',
      title: 'Could not load student career view',
      description: 'Verify the student is assigned to you and try again.'
    });
  }
}

async function initTutorCareer() {
  initPortalUX();
  setActiveNav('career');
  trackPortalEvent('tutor_career_viewed', { role: 'tutor' });

  qs('#loadCareerStudentBtn')?.addEventListener('click', () => {
    const studentId = String(qs('#careerStudentId')?.value || '').trim();
    loadStudentCareer(studentId).catch(() => undefined);
  });

  await loadStudentCareer('');
}

initTutorCareer();
