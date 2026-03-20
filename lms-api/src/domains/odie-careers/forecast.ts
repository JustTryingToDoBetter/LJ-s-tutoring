import type { CareerForecast, CareerMetricSnapshot, TrendDirection, ForecastLabel, ConfidenceLabel } from './types.js';

function clamp(value: number, min: number, max: number) {
  return Math.max(min, Math.min(max, value));
}

function average(values: number[]) {
  if (values.length === 0) return 0;
  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

function labelDirection(score: number): TrendDirection {
  if (score >= 58) return 'up';
  if (score <= 42) return 'down';
  return 'flat';
}

function labelForecast(score: number): ForecastLabel {
  if (score >= 72) return 'strong_positive';
  if (score >= 58) return 'positive';
  if (score >= 45) return 'steady';
  return 'watchlist';
}

function labelConfidence(snapshotCount: number, yearSpan: number): ConfidenceLabel {
  if (snapshotCount >= 4 && yearSpan >= 3) return 'high';
  if (snapshotCount >= 3 && yearSpan >= 2) return 'medium';
  return 'low';
}

export function buildCareerForecast(snapshots: CareerMetricSnapshot[]): CareerForecast {
  if (snapshots.length === 0) {
    return {
      direction: 'flat',
      label: 'watchlist',
      confidence: 'low',
      demandOutlookScore: 50,
      salaryTrendScore: 50,
      forecastScore: 50,
      summary: 'Limited source data is available, so the outlook is neutral until new snapshots are ingested.',
      explainers: ['Fallback mode is active because no historical snapshots were loaded.'],
    };
  }

  const ordered = [...snapshots].sort((a, b) => a.year - b.year);
  const first = ordered[0];
  const last = ordered[ordered.length - 1];
  const yearSpan = Math.max(1, last.year - first.year);
  const salaryDeltaPct = ((last.medianSalaryZar - first.medianSalaryZar) / Math.max(first.medianSalaryZar, 1)) * 100;
  const demandDelta = last.demandScore - first.demandScore;
  const growthDelta = last.growthSignal - first.growthSignal;

  const salaryTrendScore = clamp(50 + salaryDeltaPct * 0.7, 10, 95);
  const demandOutlookScore = clamp(average(ordered.map((item) => item.demandScore)) + demandDelta * 0.6 + growthDelta * 0.4, 10, 95);
  const stabilityBonus = clamp(ordered.length * 3 + yearSpan * 2, 0, 12);
  const forecastScore = clamp(salaryTrendScore * 0.4 + demandOutlookScore * 0.45 + (average(ordered.map((item) => item.growthSignal)) * 0.15) + stabilityBonus, 10, 95);

  const direction = labelDirection(forecastScore);
  const confidence = labelConfidence(ordered.length, yearSpan);
  const label = confidence === 'low' && forecastScore < 55 ? 'watchlist' : labelForecast(forecastScore);

  const explainers = [
    `Salary trend moved ${salaryDeltaPct >= 0 ? 'up' : 'down'} ${Math.abs(Math.round(salaryDeltaPct))}% across ${yearSpan + 1} annual snapshots.`,
    `Demand signal now sits at ${Math.round(last.demandScore)}/100 after a ${demandDelta >= 0 ? '+' : ''}${Math.round(demandDelta)} point shift.`,
    `Confidence is ${confidence} because ${ordered.length} usable snapshots were available.`,
  ];

  const summary = label === 'strong_positive'
    ? 'Forecast points to rising demand and healthy pay momentum in the South African market.'
    : label === 'positive'
      ? 'Signals are net positive, with enough demand strength to justify active exploration.'
      : label === 'steady'
        ? 'Outlook is stable rather than explosive, so this path rewards deliberate positioning.'
        : 'Signals are mixed, so treat this path as viable only with a clear niche or adjacent fallback.';

  return {
    direction,
    label,
    confidence,
    demandOutlookScore: Math.round(demandOutlookScore),
    salaryTrendScore: Math.round(salaryTrendScore),
    forecastScore: Math.round(forecastScore),
    summary,
    explainers,
  };
}
