import { loadJson, setActiveNav } from '/assets/common.js';

setActiveNav('career');

const state = {
  overview: null,
  careers: [],
  activeCareerId: null,
  detail: null,
  eligibility: null,
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
const careerDetailTitle = document.getElementById('careerDetailTitle');
const careerForecastBadge = document.getElementById('careerForecastBadge');
const subjectInputs = document.getElementById('subjectInputs');
const eligibilityForm = document.getElementById('eligibilityForm');
const eligibilityResults = document.getElementById('eligibilityResults');
const eligibilityHighlights = document.getElementById('eligibilityHighlights');
const apsValue = document.getElementById('apsValue');
const eligibleCount = document.getElementById('eligibleCount');
const closeCount = document.getElementById('closeCount');
const institutionCount = document.getElementById('institutionCount');

const sampleStemMarks = {
  English: 68,
  Mathematics: 72,
  'Physical Sciences': 70,
  'Life Sciences': 62,
  'Computer Applications Technology': 75,
  Geography: 64,
  'Business Studies': 58,
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
  return label.replaceAll('_', ' ');
}

function renderCareerFilters() {
  const categories = [...new Set(state.careers.map((career) => career.category))].slice(0, 6);
  careerQuickFilters.innerHTML = '';

  ['All', ...categories].forEach((category) => {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'filter-chip';
    button.textContent = category;
    button.addEventListener('click', async () => {
      careerSearchInput.value = category === 'All' ? '' : category;
      await searchCareers(careerSearchInput.value);
    });
    careerQuickFilters.appendChild(button);
  });
}

function renderCareerList(items) {
  careerResults.innerHTML = '';
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
  careerForecastBadge.textContent = `${forecastLabel(detail.forecast.label)} • ${detail.forecast.confidence} confidence`;
  careerForecastBadge.className = `badge subtle ${detail.forecast.direction}`;

  careerDetail.innerHTML = `
    <div class="list-item odie-detail-card">
      <p>${escapeHtml(detail.description)}</p>
      <div class="metric-grid">
        <div class="metric-card">
          <span class="metric-label">Salary band</span>
          <strong>${currency.format(detail.salaryRange.low)} – ${currency.format(detail.salaryRange.high)}</strong>
          <span class="note">Median: ${currency.format(detail.salaryRange.median)}</span>
        </div>
        <div class="metric-card">
          <span class="metric-label">Demand outlook</span>
          <strong>${detail.forecast.demandOutlookScore}/100</strong>
          <span class="note">${escapeHtml(detail.demandLabel)}</span>
        </div>
        <div class="metric-card">
          <span class="metric-label">Time to enter</span>
          <strong>${detail.timeToEnterMonths.min}-${detail.timeToEnterMonths.max} months</strong>
          <span class="note">Depending on route and work-readiness path.</span>
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
        <strong>Related roles</strong>
        <div class="link-stack compact">${detail.relatedCareers.map((item) => `<a href="#" data-career-link="${escapeHtml(item.id)}">${escapeHtml(item.title)} · ${escapeHtml(item.growthLabel)}</a>`).join('')}</div>
      </div>
      <div class="guide-section">
        <strong>Future signals</strong>
        <ul class="bullet-list">${detail.futureSignals.map((item) => `<li>${escapeHtml(item)}</li>`).join('')}</ul>
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
    .map((input) => ({ subject: input.name, percentage: Number(input.value) }))
    .filter((item) => Number.isFinite(item.percentage) && inputHasValue(item.percentage));
}

function inputHasValue(value) {
  return value >= 0 && value <= 100;
}

function renderEligibilitySummary(payload) {
  const eligible = payload.results.filter((result) => result.status === 'eligible').length;
  const close = payload.results.filter((result) => result.status === 'close').length;
  apsValue.textContent = String(payload.aps);
  eligibleCount.textContent = String(eligible);
  closeCount.textContent = String(close);

  eligibilityHighlights.innerHTML = `
    <div class="list-item">
      <strong>How to read this</strong>
      <p>Eligible means you currently meet the cached minimums. Close means you are near the threshold and can act on the missing requirements shown below.</p>
    </div>
  `;
}

function renderEligibilityResults(payload) {
  eligibilityResults.innerHTML = '';
  if (!payload.results.length) {
    eligibilityResults.innerHTML = '<div class="empty-state">Add at least one subject result to see course matches.</div>';
    return;
  }

  payload.results.slice(0, 12).forEach((result) => {
    const item = document.createElement('div');
    item.className = 'list-item odie-result-card';
    item.innerHTML = `
      <div class="row-head compact">
        <div>
          <strong>${escapeHtml(result.programmeName)}</strong>
          <div class="note">${escapeHtml(result.institutionName)} · ${escapeHtml(result.qualificationType)}${result.faculty ? ` · ${escapeHtml(result.faculty)}` : ''}</div>
        </div>
        <span class="status-pill ${result.status}">${statusLabel(result.status)}</span>
      </div>
      <div class="career-card-meta">
        <span>Alignment ${result.alignmentScore}/100</span>
        <span>${escapeHtml(result.requirementConfidence)} requirement confidence</span>
        <a href="${escapeHtml(result.sourceUrl)}" target="_blank" rel="noreferrer">Source</a>
      </div>
      <div class="guide-section compact">
        <strong>Minimum requirements</strong>
        <ul class="bullet-list">
          ${result.minimumRequirements.minimumAps ? `<li>APS: ${result.minimumRequirements.minimumAps}+</li>` : ''}
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
  renderCareerList(state.careers);
  if (!state.activeCareerId && state.careers[0]) {
    await loadCareerDetail(state.careers[0].id);
  }
}

async function bootstrap() {
  try {
    const overview = await loadJson('/odie-careers/overview');
    state.overview = overview;
    state.careers = overview.careers || [];
    institutionCount.textContent = String((overview.institutions || []).length);
    renderCareerFilters();
    renderSubjectInputs(overview.supportedSubjects || []);
    renderCareerList(state.careers);
    renderCareerDetail(null);
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
  subjectInputs.querySelectorAll('input').forEach((input) => {
    input.value = sampleStemMarks[input.name] ?? '';
  });
});

document.getElementById('clearResultsBtn')?.addEventListener('click', () => {
  subjectInputs.querySelectorAll('input').forEach((input) => {
    input.value = '';
  });
  apsValue.textContent = '0';
  eligibleCount.textContent = '0';
  closeCount.textContent = '0';
  eligibilityResults.innerHTML = '<div class="empty-state">Add at least one subject result to see course matches.</div>';
  eligibilityHighlights.innerHTML = '';
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
    renderEligibilitySummary(payload);
    renderEligibilityResults(payload);
  } catch (error) {
    eligibilityResults.innerHTML = `<div class="empty-state">${escapeHtml(error instanceof Error ? error.message : 'Evaluation failed')}</div>`;
  }
});

bootstrap();
