import { setActiveNav } from '/assets/common.js';
import {
  collectSubjects,
  escapeHtml,
  evaluateEligibility as fetchEligibility,
  fillResults,
  formatInstitutionTypes,
  isUnauthorizedError,
  loadOdieOverview,
  renderAuthState,
  renderSubjectInputs,
  sampleBusinessMarks,
  sampleHumanitiesMarks,
  sampleStemMarks,
  setOverviewCounts,
  statusLabel,
} from '/assets/student/odie-careers.js';

setActiveNav('career');

const state = {
  eligibility: null,
  eligibilityStatusFilter: 'all',
};

const subjectInputs = document.getElementById('subjectInputs');
const eligibilityForm = document.getElementById('eligibilityForm');
const eligibilityResults = document.getElementById('eligibilityResults');
const eligibilityHighlights = document.getElementById('eligibilityHighlights');
const eligibilityResultFilters = document.getElementById('eligibilityResultFilters');
const profileSignals = document.getElementById('profileSignals');
const apsValue = document.getElementById('apsValue');
const averageValue = document.getElementById('averageValue');
const eligibleCount = document.getElementById('eligibleCount');
const closeCount = document.getElementById('closeCount');
const institutionCount = document.getElementById('institutionCount');
const courseCount = document.getElementById('courseCount');
const subjectCount = document.getElementById('subjectCount');
const sourceGeneratedAt = document.getElementById('sourceGeneratedAt');

function renderProfileSignals(summary) {
  if (!summary) {
    profileSignals.innerHTML = '';
    return;
  }

  profileSignals.innerHTML = `
    <strong>Profile signal</strong>
    <p>${summary.signalLabels.length ? escapeHtml(summary.signalLabels.join(', ')) : 'No strong directional signal yet.'}</p>
    <div class="career-card-meta">
      ${summary.strongestSubjects.map((subject) => `<span>${escapeHtml(subject.subject)} ${subject.percentage}%</span>`).join('')}
    </div>
    <ul class="bullet-list">${summary.routeSuggestions.map((item) => `<li>${escapeHtml(item)}</li>`).join('')}</ul>
  `;
}

function renderEligibilityResultFilters(payload) {
  if (!payload?.results?.length) {
    eligibilityResultFilters.innerHTML = '';
    return;
  }

  const statusCounts = {
    all: payload.results.length,
    eligible: payload.results.filter((result) => result.status === 'eligible').length,
    close: payload.results.filter((result) => result.status === 'close').length,
    not_eligible: payload.results.filter((result) => result.status === 'not_eligible').length,
  };

  eligibilityResultFilters.innerHTML = '';

  [
    ['all', `All (${statusCounts.all})`],
    ['eligible', `Eligible (${statusCounts.eligible})`],
    ['close', `Close (${statusCounts.close})`],
    ['not_eligible', `Not eligible (${statusCounts.not_eligible})`],
  ].forEach(([value, label]) => {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'filter-chip';
    button.textContent = label;
    button.setAttribute('aria-pressed', String(state.eligibilityStatusFilter === value));
    button.addEventListener('click', () => {
      state.eligibilityStatusFilter = value;
      renderEligibilityResultFilters(payload);
      renderEligibilityResults(payload);
    });
    eligibilityResultFilters.appendChild(button);
  });
}

function renderEligibilitySummary(payload) {
  const eligible = payload.results.filter((result) => result.status === 'eligible').length;
  const close = payload.results.filter((result) => result.status === 'close').length;

  apsValue.textContent = String(payload.aps);
  averageValue.textContent = `${payload.averagePercentage}%`;
  eligibleCount.textContent = String(eligible);
  closeCount.textContent = String(close);

  renderProfileSignals(payload.profileSummary);

  eligibilityHighlights.innerHTML = `
    <div class="list-item">
      <strong>How to read this</strong>
      <p>Eligible means you currently meet the cached minimums. Close means you are within a small improvement band. Not currently eligible means you still need larger movement or a different entry route.</p>
    </div>
    <div class="list-item">
      <strong>Current profile</strong>
      <p>Your strongest subjects right now are ${payload.profileSummary.strongestSubjects.map((subject) => `${subject.subject} ${subject.percentage}%`).join(', ') || 'still loading'}.</p>
    </div>
  `;

  renderEligibilityResultFilters(payload);
}

function getVisibleEligibilityResults(payload) {
  if (!payload?.results?.length) {
    return [];
  }
  if (state.eligibilityStatusFilter === 'all') {
    return payload.results;
  }
  return payload.results.filter((result) => result.status === state.eligibilityStatusFilter);
}

function renderEligibilityResults(payload) {
  eligibilityResults.innerHTML = '';

  if (!payload?.results?.length) {
    eligibilityResults.innerHTML = '<div class="empty-state">Add at least one subject result to see course matches.</div>';
    return;
  }

  const visibleResults = getVisibleEligibilityResults(payload);
  if (!visibleResults.length) {
    eligibilityResults.innerHTML = '<div class="empty-state">No courses matched the current result filter.</div>';
    return;
  }

  visibleResults.slice(0, 16).forEach((result) => {
    const item = document.createElement('div');
    item.className = 'list-item odie-result-card';
    item.innerHTML = `
      <div class="row-head compact">
        <div>
          <strong>${escapeHtml(result.programmeName)}</strong>
          <div class="note">${escapeHtml(result.institutionName)} | ${escapeHtml(result.qualificationType)}${result.faculty ? ` | ${escapeHtml(result.faculty)}` : ''}</div>
        </div>
        <span class="status-pill ${result.status}">${statusLabel(result.status)}</span>
      </div>
      <div class="career-card-meta">
        <span>Alignment ${result.alignmentScore}/100</span>
        <span>${escapeHtml(result.requirementConfidence)} confidence</span>
        <span>${escapeHtml(formatInstitutionTypes(result.institutionTypes))}</span>
        <a href="${escapeHtml(result.sourceUrl)}" target="_blank" rel="noreferrer">Source</a>
      </div>
      <div class="guide-section compact">
        <strong>Minimum requirements</strong>
        <ul class="bullet-list">
          ${result.minimumRequirements.minimumAps ? `<li>APS: ${result.minimumRequirements.minimumAps}+</li>` : ''}
          ${result.minimumRequirements.minimumOverallPercentage ? `<li>Average: ${result.minimumRequirements.minimumOverallPercentage}%+</li>` : ''}
          ${result.minimumRequirements.minimumEnglishPercentage ? `<li>English: ${result.minimumRequirements.minimumEnglishPercentage}%+</li>` : ''}
          ${result.minimumRequirements.subjectRequirements.map((requirement) => `<li>${escapeHtml(requirement.label)}: ${requirement.minimumPercentage}%+</li>`).join('')}
          ${result.minimumRequirements.notes.map((note) => `<li>${escapeHtml(note)}</li>`).join('')}
        </ul>
      </div>
      <div class="guide-section compact">
        <strong>${result.missingRequirements.length ? 'Missing requirements' : 'You meet the current minimums'}</strong>
        ${result.missingRequirements.length
    ? `<ul class="bullet-list">${result.missingRequirements.map((gap) => `<li>${escapeHtml(gap.message)}</li>`).join('')}</ul>`
    : '<p>You are currently above the cached minimum entry requirements for this route.</p>'}
      </div>
      <div class="guide-section compact">
        <strong>Recommended next actions</strong>
        <ul class="bullet-list">${result.recommendedActions.map((action) => `<li>${escapeHtml(action)}</li>`).join('')}</ul>
      </div>
      ${result.alignedSignals.length
    ? `<div class="guide-section compact"><strong>Why this surfaced</strong><p>${escapeHtml(result.alignedSignals.join(', '))} subject signals align with this route.</p></div>`
    : ''}
    `;
    eligibilityResults.appendChild(item);
  });
}

function resetEligibilityState() {
  state.eligibility = null;
  state.eligibilityStatusFilter = 'all';
  apsValue.textContent = '0';
  averageValue.textContent = '0%';
  eligibleCount.textContent = '0';
  closeCount.textContent = '0';
  profileSignals.innerHTML = '';
  eligibilityResults.innerHTML = '<div class="empty-state">Add at least one subject result to see course matches.</div>';
  eligibilityHighlights.innerHTML = '';
  eligibilityResultFilters.innerHTML = '';
}

async function bootstrap() {
  try {
    const overview = await loadOdieOverview();
    setOverviewCounts(overview, {
      courseCount,
      institutionCount,
      sourceGeneratedAt,
    });
    subjectCount.textContent = String(overview.supportedSubjects?.length ?? 0);
    renderSubjectInputs(overview.supportedSubjects || [], subjectInputs);
    resetEligibilityState();
  } catch (error) {
    if (isUnauthorizedError(error)) {
      renderAuthState(eligibilityResults, 'Course Eligibility preview is warming up.');
      sourceGeneratedAt.textContent = 'Course Eligibility is still being wired up in development mode.';
      return;
    }
    eligibilityResults.innerHTML = `<div class="empty-state">${escapeHtml(error instanceof Error ? error.message : 'unknown_error')}</div>`;
  }
}

document.getElementById('fillSampleResultsBtn')?.addEventListener('click', () => {
  fillResults(subjectInputs, sampleStemMarks);
});

document.getElementById('fillBusinessResultsBtn')?.addEventListener('click', () => {
  fillResults(subjectInputs, sampleBusinessMarks);
});

document.getElementById('fillHumanitiesResultsBtn')?.addEventListener('click', () => {
  fillResults(subjectInputs, sampleHumanitiesMarks);
});

document.getElementById('clearResultsBtn')?.addEventListener('click', () => {
  fillResults(subjectInputs, {});
  resetEligibilityState();
});

eligibilityForm?.addEventListener('submit', async (event) => {
  event.preventDefault();
  const subjects = collectSubjects(subjectInputs);

  if (subjects.length === 0) {
    eligibilityResults.innerHTML = '<div class="empty-state">Enter at least one subject mark to evaluate course eligibility.</div>';
    return;
  }

  try {
    const payload = await fetchEligibility(subjects);
    state.eligibility = payload;
    state.eligibilityStatusFilter = 'all';
    renderEligibilitySummary(payload);
    renderEligibilityResults(payload);
  } catch (error) {
    if (isUnauthorizedError(error)) {
      renderAuthState(eligibilityResults, 'Course Eligibility preview is warming up.');
      return;
    }
    eligibilityResults.innerHTML = `<div class="empty-state">${escapeHtml(error instanceof Error ? error.message : 'Evaluation failed')}</div>`;
  }
});

bootstrap();
