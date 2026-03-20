import { loadJson, setActiveNav } from '/assets/common.js';

setActiveNav('career');

const state = {
  overview: null,
  careers: [],
  activeCareerId: null,
  detail: null,
  eligibility: null,
  eligibilityStatusFilter: 'all',
};

const currency = new Intl.NumberFormat('en-ZA', {
  style: 'currency',
  currency: 'ZAR',
  maximumFractionDigits: 0,
});

const careerResults = document.getElementById('careerResults');
const careerDetail = document.getElementById('careerDetail');
const careerSearchInput = document.getElementById('careerSearchInput');
const careerQuickFilters = document.getElementById('careerQuickFilters');
const careerResultsSummary = document.getElementById('careerResultsSummary');
const careerDetailTitle = document.getElementById('careerDetailTitle');
const careerForecastBadge = document.getElementById('careerForecastBadge');
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
const careerCount = document.getElementById('careerCount');
const courseCount = document.getElementById('courseCount');
const sourceGeneratedAt = document.getElementById('sourceGeneratedAt');

const sampleStemMarks = {
  English: 68,
  Mathematics: 72,
  'Physical Sciences': 70,
  'Life Sciences': 62,
  'Computer Applications Technology': 75,
  Geography: 64,
  'Business Studies': 58,
};

const sampleBusinessMarks = {
  English: 66,
  Mathematics: 58,
  Accounting: 71,
  'Business Studies': 73,
  Economics: 67,
  Geography: 61,
  History: 57,
};

const sampleHumanitiesMarks = {
  English: 72,
  History: 70,
  Geography: 68,
  'Life Sciences': 63,
  'Business Studies': 59,
  'Mathematical Literacy': 71,
};

function escapeHtml(value) {
  return String(value)
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}

function statusLabel(status) {
  if (status === 'eligible') {
    return 'Eligible';
  }
  if (status === 'close') {
    return 'Close';
  }
  return 'Not currently eligible';
}

function forecastLabel(label) {
  return String(label).replaceAll('_', ' ');
}

function formatInstitutionTypes(types = []) {
  return types
    .map((type) => type.replaceAll('_', ' '))
    .join(', ');
}

function formatDateTime(value) {
  if (!value) {
    return 'Unknown';
  }
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) {
    return value;
  }
  return new Intl.DateTimeFormat('en-ZA', {
    dateStyle: 'medium',
    timeStyle: 'short',
  }).format(parsed);
}

function setCountsFromOverview(overview) {
  careerCount.textContent = String(overview.stats?.careerCount ?? overview.careers.length);
  courseCount.textContent = String(overview.stats?.courseCount ?? 0);
  institutionCount.textContent = String(overview.stats?.institutionCount ?? overview.institutions.length);
  sourceGeneratedAt.textContent = `Cached sources last refreshed: ${formatDateTime(overview.generatedAt)}. Live source refresh is optional and the app falls back to normalized local cache when source pages are brittle.`;
}

function renderCareerFilters() {
  const categories = [...new Set((state.overview?.careers || []).map((career) => career.category))].sort();
  const activeValue = careerSearchInput.value.trim().toLowerCase();

  careerQuickFilters.innerHTML = '';

  ['All', ...categories].forEach((category) => {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'filter-chip';
    button.textContent = category;
    const isActive = category === 'All'
      ? activeValue.length === 0
      : activeValue === category.toLowerCase();
    button.setAttribute('aria-pressed', String(isActive));
    button.addEventListener('click', async () => {
      careerSearchInput.value = category === 'All' ? '' : category;
      await searchCareers(careerSearchInput.value);
    });
    careerQuickFilters.appendChild(button);
  });
}

function renderCareerList(items) {
  careerResults.innerHTML = '';
  careerResultsSummary.textContent = `${items.length} career path${items.length === 1 ? '' : 's'} currently visible.`;

  if (!items.length) {
    careerResults.innerHTML = '<div class="empty-state">No careers matched that search yet.</div>';
    return;
  }

  items.forEach((career) => {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'list-item odie-career-card';
    button.dataset.active = String(career.id === state.activeCareerId);
    button.innerHTML = `
      <div class="row-head compact">
        <div>
          <strong>${escapeHtml(career.title)}</strong>
          <div class="note">${escapeHtml(career.category)}</div>
        </div>
        <span class="status-pill ${career.forecast.direction}">${escapeHtml(career.growthLabel)}</span>
      </div>
      <p>${escapeHtml(career.description)}</p>
      <div class="career-card-meta">
        <span>${escapeHtml(career.demandLabel)}</span>
        <span>${currency.format(career.salaryRange.median)} median</span>
        <span>${escapeHtml(forecastLabel(career.forecast.label))}</span>
      </div>
      <div class="tag-row compact">
        ${career.pathCategories.map((item) => `<span class="badge subtle">${escapeHtml(item.replaceAll('_', ' '))}</span>`).join('')}
      </div>
    `;
    button.addEventListener('click', () => loadCareerDetail(career.id));
    careerResults.appendChild(button);
  });
}

function renderCareerDetail(detail) {
  if (!detail) {
    careerDetail.innerHTML = '<div class="empty-state">Choose a career card to inspect salary trends, demand, and route options.</div>';
    return;
  }

  careerDetailTitle.textContent = detail.title;
  careerForecastBadge.textContent = `${forecastLabel(detail.forecast.label)} | ${detail.forecast.confidence} confidence`;
  careerForecastBadge.className = `badge subtle ${detail.forecast.direction}`;

  careerDetail.innerHTML = `
    <div class="list-item odie-detail-card">
      <p>${escapeHtml(detail.description)}</p>
      <div class="metric-grid">
        <div class="metric-card">
          <span class="metric-label">Salary band</span>
          <strong>${currency.format(detail.salaryRange.low)} to ${currency.format(detail.salaryRange.high)}</strong>
          <span class="note">Median: ${currency.format(detail.salaryRange.median)}</span>
        </div>
        <div class="metric-card">
          <span class="metric-label">Demand outlook</span>
          <strong>${detail.forecast.demandOutlookScore}/100</strong>
          <span class="note">${escapeHtml(detail.demandLabel)}</span>
        </div>
        <div class="metric-card">
          <span class="metric-label">Salary trend</span>
          <strong>${detail.forecast.salaryTrendScore}/100</strong>
          <span class="note">${escapeHtml(forecastLabel(detail.forecast.label))}</span>
        </div>
        <div class="metric-card">
          <span class="metric-label">Time to enter</span>
          <strong>${detail.timeToEnterMonths.min}-${detail.timeToEnterMonths.max} months</strong>
          <span class="note">Depends on route and work-readiness path.</span>
        </div>
      </div>
      <div class="guide-section">
        <strong>Forecast summary</strong>
        <p>${escapeHtml(detail.forecast.summary)}</p>
        <ul class="bullet-list">${detail.forecast.explainers.map((item) => `<li>${escapeHtml(item)}</li>`).join('')}</ul>
      </div>
      <div class="guide-section">
        <strong>Education routes</strong>
        <ul class="bullet-list">${detail.educationRoutes.map((item) => `<li>${escapeHtml(item)}</li>`).join('')}</ul>
      </div>
      <div class="guide-section">
        <strong>Institution path categories</strong>
        <div class="tag-row">${detail.pathCategories.map((item) => `<span class="badge subtle">${escapeHtml(item.replaceAll('_', ' '))}</span>`).join('')}</div>
      </div>
      <div class="guide-section">
        <strong>Historical snapshots</strong>
        <div class="list-compact">
          ${detail.metricSnapshots.map((snapshot) => `
            <div class="list-item compact-card">
              <strong>${snapshot.year}</strong>
              <div class="career-card-meta">
                <span>${currency.format(snapshot.medianSalaryZar)} median</span>
                <span>Demand ${snapshot.demandScore}/100</span>
                <span>Growth ${snapshot.growthSignal}/100</span>
              </div>
            </div>
          `).join('')}
        </div>
      </div>
      <div class="guide-section">
        <strong>Related roles</strong>
        <div class="link-stack compact">${detail.relatedCareers.map((item) => `<a href="#" data-career-link="${escapeHtml(item.id)}">${escapeHtml(item.title)} | ${escapeHtml(item.growthLabel)}</a>`).join('')}</div>
      </div>
      <div class="guide-section">
        <strong>Future signals</strong>
        <ul class="bullet-list">${detail.futureSignals.map((item) => `<li>${escapeHtml(item)}</li>`).join('')}</ul>
      </div>
      <div class="guide-section">
        <strong>Source pages</strong>
        <div class="link-stack compact">${detail.sourceUrls.map((url) => `<a href="${escapeHtml(url)}" target="_blank" rel="noreferrer">Open source reference</a>`).join('')}</div>
      </div>
    </div>
  `;

  careerDetail.querySelectorAll('[data-career-link]').forEach((link) => {
    link.addEventListener('click', (event) => {
      event.preventDefault();
      loadCareerDetail(link.getAttribute('data-career-link'));
    });
  });
}

function renderSubjectInputs(subjects) {
  subjectInputs.innerHTML = '';
  subjects.forEach((subject) => {
    const label = document.createElement('label');
    label.className = 'field';
    label.innerHTML = `
      <span>${escapeHtml(subject)}</span>
      <input type="number" min="0" max="100" inputmode="numeric" name="${escapeHtml(subject)}" placeholder="%">
    `;
    subjectInputs.appendChild(label);
  });
}

function collectSubjects() {
  return Array.from(subjectInputs.querySelectorAll('input'))
    .map((input) => ({ subject: input.name, rawValue: input.value.trim() }))
    .filter((item) => item.rawValue !== '')
    .map((item) => ({ subject: item.subject, percentage: Number(item.rawValue) }))
    .filter((item) => Number.isFinite(item.percentage) && item.percentage >= 0 && item.percentage <= 100);
}

function fillResults(sample) {
  subjectInputs.querySelectorAll('input').forEach((input) => {
    input.value = sample[input.name] ?? '';
  });
}

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

async function loadCareerDetail(careerId) {
  if (!careerId) {
    return;
  }
  const detail = await loadJson(`/odie-careers/careers/${encodeURIComponent(careerId)}`);
  state.activeCareerId = careerId;
  state.detail = detail;
  renderCareerList(state.careers);
  renderCareerDetail(detail);
}

async function searchCareers(query = '') {
  const result = await loadJson(`/odie-careers/careers${query ? `?q=${encodeURIComponent(query)}` : ''}`);
  state.careers = result.items || [];
  renderCareerFilters();
  renderCareerList(state.careers);

  if (!state.careers.some((career) => career.id === state.activeCareerId)) {
    state.activeCareerId = null;
  }

  if (!state.activeCareerId && state.careers[0]) {
    await loadCareerDetail(state.careers[0].id);
    return;
  }

  if (state.activeCareerId && state.detail?.id === state.activeCareerId) {
    renderCareerDetail(state.detail);
  }
}

async function bootstrap() {
  try {
    const overview = await loadJson('/odie-careers/overview');
    state.overview = overview;
    state.careers = overview.careers || [];

    setCountsFromOverview(overview);
    renderCareerFilters();
    renderSubjectInputs(overview.supportedSubjects || []);
    renderCareerList(state.careers);
    renderCareerDetail(null);
    renderProfileSignals(null);
    renderEligibilityResultFilters(null);
    renderEligibilityResults({ results: [] });

    if (state.careers[0]) {
      await loadCareerDetail(state.careers[0].id);
    }
  } catch (error) {
    careerResults.innerHTML = '<div class="empty-state">Odie Careers is temporarily unavailable. Please refresh shortly.</div>';
    careerDetail.innerHTML = `<div class="empty-state">${escapeHtml(error instanceof Error ? error.message : 'unknown_error')}</div>`;
  }
}

careerSearchInput?.addEventListener('input', async (event) => {
  await searchCareers(event.target.value);
});

document.getElementById('fillSampleResultsBtn')?.addEventListener('click', () => {
  fillResults(sampleStemMarks);
});

document.getElementById('fillBusinessResultsBtn')?.addEventListener('click', () => {
  fillResults(sampleBusinessMarks);
});

document.getElementById('fillHumanitiesResultsBtn')?.addEventListener('click', () => {
  fillResults(sampleHumanitiesMarks);
});

document.getElementById('clearResultsBtn')?.addEventListener('click', () => {
  fillResults({});
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
});

eligibilityForm?.addEventListener('submit', async (event) => {
  event.preventDefault();
  const subjects = collectSubjects();

  if (subjects.length === 0) {
    eligibilityResults.innerHTML = '<div class="empty-state">Enter at least one subject mark to evaluate course eligibility.</div>';
    return;
  }

  try {
    const payload = await loadJson('/odie-careers/eligibility/evaluate', {
      method: 'POST',
      body: { subjects },
    });
    state.eligibility = payload;
    state.eligibilityStatusFilter = 'all';
    renderEligibilitySummary(payload);
    renderEligibilityResults(payload);
  } catch (error) {
    eligibilityResults.innerHTML = `<div class="empty-state">${escapeHtml(error instanceof Error ? error.message : 'Evaluation failed')}</div>`;
  }
});

bootstrap();
