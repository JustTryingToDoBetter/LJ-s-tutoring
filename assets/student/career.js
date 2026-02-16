import { apiGet, apiPost, clearChildren, createEl, initPortalUX, qs, renderSkeletonCards, renderStateCard, setActiveNav, trackPortalEvent } from '/assets/portal-shared.js';

let selectedGoalIds = new Set();

function renderGoalLibrary(goals) {
  const container = qs('#careerGoalLibrary');
  clearChildren(container);

  if (!goals.length) {
    renderStateCard(container, {
      variant: 'empty',
      title: 'No goals available',
      description: 'Career goal library is currently unavailable.'
    });
    return;
  }

  const frag = document.createDocumentFragment();
  goals.forEach((goal) => {
    const row = createEl('label', { className: 'list-row' });
    const checkbox = createEl('input', {
      attrs: {
        type: 'checkbox',
        value: goal.id,
        'aria-label': `Select goal ${goal.title}`,
      }
    });
    checkbox.checked = selectedGoalIds.has(goal.id);
    checkbox.addEventListener('change', () => {
      if (checkbox.checked) {
        selectedGoalIds.add(goal.id);
      } else {
        selectedGoalIds.delete(goal.id);
      }
    });

    row.append(
      checkbox,
      createEl('strong', { text: goal.title }),
      createEl('div', { className: 'note', text: `Subjects: ${goal.recommendedSubjects.join(', ')}` }),
      createEl('div', { className: 'note', text: `Skills: ${goal.skillsChecklist.join(' · ')}` })
    );

    frag.append(row);
  });
  container.append(frag);
}

function renderRoadmap(data) {
  const roadmap = qs('#careerRoadmapList');
  const tags = qs('#careerVaultTags');

  clearChildren(roadmap);
  clearChildren(tags);

  if (data.emptyState) {
    renderStateCard(roadmap, {
      variant: 'empty',
      title: data.emptyState.title,
      description: data.emptyState.description
    });
  } else {
    const frag = document.createDocumentFragment();
    (data.selectedGoals || []).forEach((entry) => {
      const row = createEl('div', { className: 'list-row' });
      row.append(
        createEl('strong', { text: entry.goal.title }),
        createEl('div', { className: 'note', text: `Alignment: ${entry.latestSnapshot?.alignmentScore ?? 0}%` }),
        createEl('div', {
          className: 'note',
          text: (entry.latestSnapshot?.reasons || []).slice(0, 2).join(' · ') || 'No guidance yet.'
        })
      );
      frag.append(row);
    });
    roadmap.append(frag);
  }

  const tagFrag = document.createDocumentFragment();
  (data.recommendedVaultTags || []).forEach((tag) => {
    tagFrag.append(createEl('span', { className: 'tag', text: tag }));
  });
  tags.append(tagFrag);
}

async function loadCareer() {
  const library = qs('#careerGoalLibrary');
  const roadmap = qs('#careerRoadmapList');
  renderSkeletonCards(library, 3);
  renderSkeletonCards(roadmap, 2);

  try {
    const [goalsData, meData] = await Promise.all([
      apiGet('/career/goals'),
      apiGet('/career/me'),
    ]);

    selectedGoalIds = new Set((meData.selectedGoals || []).map((entry) => entry.goal.id));
    renderGoalLibrary(goalsData.goals || []);
    renderRoadmap(meData);
  } catch {
    renderStateCard(library, {
      variant: 'error',
      title: 'Could not load goal library',
      description: 'Refresh and try again.'
    });
    renderStateCard(roadmap, {
      variant: 'error',
      title: 'Could not load roadmap',
      description: 'Refresh and try again.'
    });
  }
}

function bindActions() {
  qs('#saveCareerGoalsBtn')?.addEventListener('click', async () => {
    const goalIds = [...selectedGoalIds];
    if (!goalIds.length) {
      return;
    }

    await apiPost('/career/me/goals', { goalIds });
    await loadCareer();
  });
}

async function initCareer() {
  initPortalUX();
  setActiveNav('career');
  trackPortalEvent('career_viewed', { role: 'student' });
  bindActions();
  await loadCareer();
}

initCareer();
