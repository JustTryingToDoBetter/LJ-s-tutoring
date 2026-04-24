import { setActiveNav, loadJson } from '/assets/common.js';
import { escapeHtml, isUnauthorizedError, renderAuthState } from '/assets/student/odie-careers.js';
import { getReadinessLevel } from '/assets/student/career-readiness-utils.js';

setActiveNav('career');

const state = {
  careerId: new URLSearchParams(window.location.search).get('careerId') || '',
  plan: null,
};

const readinessCareerTitle = document.getElementById('readinessCareerTitle');
const overallReadiness = document.getElementById('overallReadiness');
const readinessLevel = document.getElementById('readinessLevel');
const readinessHint = document.getElementById('readinessHint');
const readinessProgressCards = document.getElementById('readinessProgressCards');
const weeklyPlan = document.getElementById('weeklyPlan');
const nextActions = document.getElementById('nextActions');
const milestoneCategories = document.getElementById('milestoneCategories');
const evidenceSection = document.getElementById('evidenceSection');


function renderLoadingState() {
  readinessHint.textContent = 'Loading readiness plan...';
  milestoneCategories.innerHTML = '<div class="empty-state">Loading milestones...</div>';
  weeklyPlan.innerHTML = '<div class="empty-state">Loading weekly tasks...</div>';
  nextActions.innerHTML = '<div class="empty-state">Loading action recommendations...</div>';
  evidenceSection.innerHTML = '<div class="empty-state">Loading evidence coverage...</div>';
}

function renderErrorState(message) {
  readinessHint.textContent = message;
  milestoneCategories.innerHTML = `<div class="empty-state">${escapeHtml(message)}</div>`;
}

function renderProgressCards(score) {
  const cards = [
    { label: 'Core Skills', value: score.coreSkills },
    { label: 'Projects', value: score.projects },
    { label: 'Communication', value: score.communication },
    { label: 'Work Experience Proxies', value: score.workExperienceProxies },
    { label: 'Evidence', value: score.evidence },
  ];

  readinessProgressCards.innerHTML = cards.map((card) => `
    <article class="panel dashboard-card">
      <span class="metric-label">${escapeHtml(card.label)}</span>
      <strong class="metric-value">${card.value}%</strong>
    </article>
  `).join('');
}

function renderWeeklyPlan(weekly = []) {
  if (!weekly.length || !weekly[0]?.tasks?.length) {
    weeklyPlan.innerHTML = '<div class="empty-state">No weekly tasks yet. Complete milestones to refresh recommendations.</div>';
    return;
  }

  const top = weekly[0];
  weeklyPlan.innerHTML = `
    <div class="list-item">
      <strong>Week ${top.week}: ${escapeHtml(top.focus)}</strong>
      <ul class="bullet-list">
        ${top.tasks.slice(0, 5).map((task) => `<li>${escapeHtml(task.title)} (${task.estimatedHours}h)</li>`).join('')}
      </ul>
    </div>
  `;
}

function renderNextActions(actions = []) {
  if (!actions.length) {
    nextActions.innerHTML = '<div class="empty-state">No gaps detected right now. Keep verifying your evidence.</div>';
    return;
  }

  nextActions.innerHTML = actions.map((action) => `
    <div class="list-item">
      <div class="row-head compact">
        <strong>${escapeHtml(action.title)}</strong>
        <span class="badge subtle">${escapeHtml(action.impact)}</span>
      </div>
      <p>${escapeHtml(action.reason)}</p>
    </div>
  `).join('');
}

function renderEvidenceSection(categories = []) {
  const evidenceMilestones = categories.flatMap((category) => category.milestones)
    .filter((milestone) => milestone.evidenceRequired);

  if (!evidenceMilestones.length) {
    evidenceSection.innerHTML = '<div class="empty-state">No evidence-required milestones for this framework.</div>';
    return;
  }

  const missing = evidenceMilestones.filter((item) => !item.evidenceItems?.length);
  evidenceSection.innerHTML = `
    <div class="list-item">
      <strong>${evidenceMilestones.length - missing.length}/${evidenceMilestones.length} evidence-required milestones have proof attached.</strong>
      <p class="note">${missing.length ? `${missing.length} milestones still need evidence links.` : 'Great work — all required evidence is attached.'}</p>
      ${missing.length ? `<ul class="bullet-list">${missing.slice(0, 6).map((item) => `<li>${escapeHtml(item.title)}</li>`).join('')}</ul>` : ''}
    </div>
  `;
}

function renderMilestones(categories = []) {
  if (!categories.length) {
    milestoneCategories.innerHTML = '<div class="empty-state">No readiness plan available for this career yet.</div>';
    return;
  }

  milestoneCategories.innerHTML = categories.map((category) => `
    <section class="list-item">
      <div class="row-head">
        <div>
          <strong>${escapeHtml(category.title)}</strong>
          <p class="note">${escapeHtml(category.description)}</p>
        </div>
        <span class="badge subtle">${category.completionPercentage || 0}%</span>
      </div>
      <div class="list-compact">
        ${category.milestones.map((milestone) => `
          <article class="list-item compact-card">
            <div class="row-head compact">
              <strong>${escapeHtml(milestone.title)}</strong>
              <span class="badge subtle">${escapeHtml(milestone.status)}</span>
            </div>
            <p>${escapeHtml(milestone.description || '')}</p>
            <div class="career-card-meta">
              <span>${milestone.estimatedHours}h</span>
              <span>${escapeHtml(milestone.priority)} priority</span>
              <span>${milestone.evidenceRequired ? 'Evidence required' : 'Evidence optional'}</span>
            </div>
            <button type="button" class="button" data-complete-id="${escapeHtml(milestone.id)}" ${milestone.status === 'completed' || milestone.status === 'verified' ? 'disabled' : ''}>
              ${milestone.status === 'completed' || milestone.status === 'verified' ? 'Completed' : 'Mark complete'}
            </button>
          </article>
        `).join('')}
      </div>
    </section>
  `).join('');

  milestoneCategories.querySelectorAll('[data-complete-id]').forEach((button) => {
    button.addEventListener('click', async () => {
      await completeMilestone(button.getAttribute('data-complete-id'));
    });
  });
}

async function loadPlan() {
  if (!state.careerId) {
    renderErrorState('No career selected yet. Open readiness from a career detail page.');
    return;
  }

  renderLoadingState();

  try {
    const plan = await loadJson(`/odie-careers/readiness/plan?careerId=${encodeURIComponent(state.careerId)}`);
    state.plan = plan;

    readinessCareerTitle.textContent = `${plan.career.title} readiness plan`;
    overallReadiness.textContent = `${plan.readinessScore.overall}%`;
    readinessLevel.textContent = getReadinessLevel(plan.readinessScore.overall);
    readinessHint.textContent = `Framework ${plan.framework.version} • ${plan.categories.length} readiness categories.`;

    renderProgressCards(plan.readinessScore);
    renderWeeklyPlan(plan.weeklyPlan);
    renderNextActions(plan.nextActions);
    renderMilestones(plan.categories);
    renderEvidenceSection(plan.categories);
  } catch (error) {
    if (isUnauthorizedError(error)) {
      renderAuthState(milestoneCategories, 'Career readiness is warming up.');
      return;
    }
    renderErrorState(error instanceof Error ? error.message : 'Unable to load readiness plan.');
  }
}

async function completeMilestone(milestoneId) {
  if (!milestoneId || !state.plan?.career?.id) return;

  try {
    await loadJson(`/odie-careers/readiness/milestone/${encodeURIComponent(milestoneId)}/complete`, {
      method: 'POST',
      body: {
        careerId: state.plan.career.id,
        evidence: [
          {
            type: 'reflection',
            title: 'Milestone reflection',
            url: 'https://example.com/reflection',
            description: 'Completed from dashboard readiness action.',
          },
        ],
        reflection: 'Completed from readiness dashboard.',
      },
    });
    await loadPlan();
  } catch (error) {
    readinessHint.textContent = `Milestone update failed: ${escapeHtml(error instanceof Error ? error.message : 'unknown_error')}`;
  }
}

loadPlan();
