import { loadJson } from '/assets/common.js';

export const currency = new Intl.NumberFormat('en-ZA', {
  style: 'currency',
  currency: 'ZAR',
  maximumFractionDigits: 0,
});

export const sampleStemMarks = {
  English: 68,
  Mathematics: 72,
  'Physical Sciences': 70,
  'Life Sciences': 62,
  'Computer Applications Technology': 75,
  Geography: 64,
  'Business Studies': 58,
};

export const sampleBusinessMarks = {
  English: 66,
  Mathematics: 58,
  Accounting: 71,
  'Business Studies': 73,
  Economics: 67,
  Geography: 61,
  History: 57,
};

export const sampleHumanitiesMarks = {
  English: 72,
  History: 70,
  Geography: 68,
  'Life Sciences': 63,
  'Business Studies': 59,
  'Mathematical Literacy': 71,
};

export function escapeHtml(value) {
  return String(value)
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}

export function statusLabel(status) {
  if (status === 'eligible') {
    return 'Eligible';
  }
  if (status === 'close') {
    return 'Close';
  }
  return 'Not currently eligible';
}

export function forecastLabel(label) {
  return String(label).replaceAll('_', ' ');
}

export function formatInstitutionTypes(types = []) {
  return types
    .map((type) => type.replaceAll('_', ' '))
    .join(', ');
}

export function formatDateTime(value) {
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

export function isUnauthorizedError(error) {
  return error?.status === 401 || error?.code === 'unauthorized';
}

function isDevelopmentPreview() {
  return window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1';
}

export function renderAuthState(target, title = 'Odie Careers is warming up.') {
  if (!target) {
    return;
  }

  if (isDevelopmentPreview()) {
    target.innerHTML = `
      <div class="empty-state">
        <strong>${escapeHtml(title)}</strong>
        <p>Odie Careers is still being wired up in development mode. Try again shortly.</p>
      </div>
    `;
    return;
  }

  target.innerHTML = `
    <div class="empty-state">
      <strong>${escapeHtml(title)}</strong>
      <p>Please sign in again to use Odie Careers.</p>
      <a class="button" href="/login.html">Go to login</a>
    </div>
  `;
}

export async function loadOdieOverview() {
  return loadJson('/odie-careers/overview');
}

export async function searchCareers(query = '') {
  return loadJson(`/odie-careers/careers${query ? `?q=${encodeURIComponent(query)}` : ''}`);
}

export async function loadCareerDetail(careerId) {
  return loadJson(`/odie-careers/careers/${encodeURIComponent(careerId)}`);
}

export async function evaluateEligibility(subjects) {
  return loadJson('/odie-careers/eligibility/evaluate', {
    method: 'POST',
    body: { subjects },
  });
}

export function setOverviewCounts(overview, elements = {}) {
  const {
    careerCount,
    courseCount,
    institutionCount,
    sourceGeneratedAt,
  } = elements;

  if (careerCount) {
    careerCount.textContent = String(overview.stats?.careerCount ?? overview.careers.length);
  }
  if (courseCount) {
    courseCount.textContent = String(overview.stats?.courseCount ?? 0);
  }
  if (institutionCount) {
    institutionCount.textContent = String(overview.stats?.institutionCount ?? overview.institutions.length);
  }
  if (sourceGeneratedAt) {
    sourceGeneratedAt.textContent = `Cached sources last refreshed: ${formatDateTime(overview.generatedAt)}.`;
  }
}

export function renderSubjectInputs(subjects, target) {
  target.innerHTML = '';
  subjects.forEach((subject) => {
    const label = document.createElement('label');
    label.className = 'field';
    label.innerHTML = `
      <span>${escapeHtml(subject)}</span>
      <input type="number" min="0" max="100" inputmode="numeric" name="${escapeHtml(subject)}" placeholder="%">
    `;
    target.appendChild(label);
  });
}

export function collectSubjects(target) {
  return Array.from(target.querySelectorAll('input'))
    .map((input) => ({ subject: input.name, rawValue: input.value.trim() }))
    .filter((item) => item.rawValue !== '')
    .map((item) => ({ subject: item.subject, percentage: Number(item.rawValue) }))
    .filter((item) => Number.isFinite(item.percentage) && item.percentage >= 0 && item.percentage <= 100);
}

export function fillResults(target, sample) {
  target.querySelectorAll('input').forEach((input) => {
    input.value = sample[input.name] ?? '';
  });
}
