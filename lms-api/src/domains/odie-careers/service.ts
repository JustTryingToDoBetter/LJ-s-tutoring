import { loadCareerDataset, loadCourseDataset, loadSourceManifest } from './data.js';
import { buildCareerForecast } from './forecast.js';
import { evaluateEligibility } from './eligibility.js';
import type {
  CareerDetail,
  CareerSummary,
  OdieCareersOverview,
  StudentProfile,
} from './types.js';

function quantile(values: number[], percentile: number) {
  if (values.length === 0) return 0;
  const ordered = [...values].sort((a, b) => a - b);
  const index = Math.max(0, Math.min(ordered.length - 1, Math.round((ordered.length - 1) * percentile)));
  return ordered[index];
}

function demandLabel(score: number) {
  if (score >= 72) return 'High demand';
  if (score >= 55) return 'Stable demand';
  return 'Watch demand';
}

function growthLabel(score: number) {
  if (score >= 72) return 'Growing';
  if (score >= 55) return 'Steady';
  return 'Mixed';
}

function buildCareerSummary(record: ReturnType<typeof loadCareerDataset>['careers'][number], allCareers: ReturnType<typeof loadCareerDataset>['careers']): CareerSummary {
  const salaries = record.metricSnapshots.map((snapshot) => snapshot.medianSalaryZar);
  const forecast = buildCareerForecast(record.metricSnapshots);

  return {
    id: record.id,
    title: record.title,
    description: record.description,
    category: record.category,
    salaryRange: {
      low: quantile(salaries, 0.1),
      median: quantile(salaries, 0.5),
      high: quantile(salaries, 0.9),
    },
    demandLabel: demandLabel(forecast.demandOutlookScore),
    growthLabel: growthLabel(forecast.forecastScore),
    pathCategories: record.institutionPathCategories,
    forecast,
  };
}

export function getOdieCareersOverview(): OdieCareersOverview {
  const careers = loadCareerDataset().careers;
  const courses = loadCourseDataset();
  const sources = loadSourceManifest();

  return {
    generatedAt: sources.lastRunAt,
    careers: careers.map((career) => buildCareerSummary(career, careers)),
    institutions: courses.institutions,
    supportedSubjects: courses.supportedSubjects,
    sourceSummary: {
      salary: 'Payscale South Africa job pages are the primary salary reference with cached normalization fallback.',
      courses: 'Institution programme pages are normalized into a cached first-entry course catalog for Cape Town options.',
    },
  };
}

export function getCareerDetail(careerId: string): CareerDetail | null {
  const dataset = loadCareerDataset();
  const record = dataset.careers.find((item) => item.id === careerId);
  if (!record) return null;

  const summary = buildCareerSummary(record, dataset.careers);
  return {
    ...summary,
    educationRoutes: record.educationRoutes,
    relatedCareers: record.relatedCareerIds
      .map((relatedId) => dataset.careers.find((item) => item.id === relatedId))
      .filter(Boolean)
      .map((item) => ({
        id: item!.id,
        title: item!.title,
        category: item!.category,
        growthLabel: growthLabel(buildCareerForecast(item!.metricSnapshots).forecastScore),
      })),
    timeToEnterMonths: record.timeToEnterMonths,
    futureSignals: record.futureSignals,
    metricSnapshots: record.metricSnapshots,
    sourceUrls: record.sourceUrls,
  };
}

export function searchCareerSummaries(query?: string) {
  const normalizedQuery = query?.trim().toLowerCase();
  const dataset = loadCareerDataset();
  const careers = dataset.careers
    .filter((career) => !normalizedQuery || career.title.toLowerCase().includes(normalizedQuery) || career.category.toLowerCase().includes(normalizedQuery))
    .map((career) => buildCareerSummary(career, dataset.careers));

  return careers.sort((a, b) => a.title.localeCompare(b.title));
}

export function evaluateStudentProfile(profile: StudentProfile) {
  const { courses } = loadCourseDataset();
  return {
    aps: profile.subjects.length > 0 ? profile.subjects.reduce((sum, subject) => sum + Math.ceil(subject.percentage / 10), 0) : 0,
    results: evaluateEligibility(profile, courses),
  };
}
