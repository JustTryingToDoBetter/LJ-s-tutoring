import { describe, expect, it } from 'vitest';
import { buildCareerForecast } from '../src/domains/odie-careers/forecast.js';

describe('Odie Careers forecast engine', () => {
  it('returns a strong positive forecast for consistent growth snapshots', () => {
    const result = buildCareerForecast([
      { year: 2022, medianSalaryZar: 240000, salarySource: 'test', demandScore: 62, growthSignal: 60 },
      { year: 2023, medianSalaryZar: 270000, salarySource: 'test', demandScore: 69, growthSignal: 68 },
      { year: 2024, medianSalaryZar: 300000, salarySource: 'test', demandScore: 76, growthSignal: 74 },
      { year: 2025, medianSalaryZar: 336000, salarySource: 'test', demandScore: 82, growthSignal: 80 },
    ]);

    expect(result.direction).toBe('up');
    expect(result.label).toBe('strong_positive');
    expect(result.confidence).toBe('high');
    expect(result.forecastScore).toBeGreaterThan(70);
  });

  it('degrades confidence when only a small snapshot set is available', () => {
    const result = buildCareerForecast([
      { year: 2024, medianSalaryZar: 240000, salarySource: 'test', demandScore: 48, growthSignal: 45 },
      { year: 2025, medianSalaryZar: 238000, salarySource: 'test', demandScore: 44, growthSignal: 43 },
    ]);

    expect(result.confidence).toBe('low');
    expect(result.label).toBe('watchlist');
  });
});
