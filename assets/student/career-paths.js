import { setActiveNav } from '/assets/common.js';
import {
  currency,
  escapeHtml,
  forecastLabel,
  isUnauthorizedError,
  loadCareerDetail as fetchCareerDetail,
  loadOdieOverview,
  renderAuthState,
  searchCareers as fetchCareerSearch,
  setOverviewCounts,
} from '/assets/student/odie-careers.js';

setActiveNav('career');

const state = {
  overview: null,
  careers: [],
  activeCareerId: null,
  detail: null,
};

const careerResults = document.getElementById('careerResults');
const careerDetail = document.getElementById('careerDetail');
const careerSearchInput = document.getElementById('careerSearchInput');
const careerQuickFilters = document.getElementById('careerQuickFilters');
const careerResultsSummary = document.getElementById('careerResultsSummary');
const careerDetailTitle = document.getElementById('careerDetailTitle');
const careerForecastBadge = document.getElementById('careerForecastBadge');
const institutionCount = document.getElementById('institutionCount');
const careerCount = document.getElementById('careerCount');
const courseCount = document.getElementById('courseCount');
const sourceGeneratedAt = document.getElementById('sourceGeneratedAt');

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

async function loadCareerDetail(careerId) {
  if (!careerId) {
    return;
  }

  try {
    const detail = await fetchCareerDetail(careerId);
    state.activeCareerId = careerId;
    state.detail = detail;
    renderCareerList(state.careers);
    renderCareerDetail(detail);
  } catch (error) {
    if (isUnauthorizedError(error)) {
      renderAuthState(careerResults, 'Career Paths preview is warming up.');
      renderAuthState(careerDetail, 'Career Paths preview is warming up.');
      return;
    }
    careerDetail.innerHTML = `<div class="empty-state">${escapeHtml(error instanceof Error ? error.message : 'unknown_error')}</div>`;
  }
}

async function searchCareers(query = '') {
  try {
    const result = await fetchCareerSearch(query);
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
  } catch (error) {
    if (isUnauthorizedError(error)) {
      renderAuthState(careerResults, 'Career Paths preview is warming up.');
      renderAuthState(careerDetail, 'Career Paths preview is warming up.');
      return;
    }
    careerResults.innerHTML = '<div class="empty-state">Career Paths is temporarily unavailable. Please refresh shortly.</div>';
    careerDetail.innerHTML = `<div class="empty-state">${escapeHtml(error instanceof Error ? error.message : 'unknown_error')}</div>`;
  }
}

async function bootstrap() {
  try {
    const overview = await loadOdieOverview();
    state.overview = overview;
    state.careers = overview.careers || [];

    setOverviewCounts(overview, {
      careerCount,
      courseCount,
      institutionCount,
      sourceGeneratedAt,
    });
    renderCareerFilters();
    renderCareerList(state.careers);
    renderCareerDetail(null);

    if (state.careers[0]) {
      await loadCareerDetail(state.careers[0].id);
    }
  } catch (error) {
    if (isUnauthorizedError(error)) {
      renderAuthState(careerResults, 'Career Paths preview is warming up.');
      renderAuthState(careerDetail, 'Career Paths preview is warming up.');
      sourceGeneratedAt.textContent = 'Career Paths is still being wired up in development mode.';
      return;
    }
    careerResults.innerHTML = '<div class="empty-state">Career Paths is temporarily unavailable. Please refresh shortly.</div>';
    careerDetail.innerHTML = `<div class="empty-state">${escapeHtml(error instanceof Error ? error.message : 'unknown_error')}</div>`;
  }
}

careerSearchInput?.addEventListener('input', async (event) => {
  await searchCareers(event.target.value);
});

bootstrap();
