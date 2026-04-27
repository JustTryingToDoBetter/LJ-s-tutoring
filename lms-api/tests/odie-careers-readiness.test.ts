import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { buildApp } from '../src/app.js';
import {
  completeReadinessMilestone,
  getBaselineReadinessFramework,
  getReadinessPlanForCareer,
} from '../src/domains/odie-careers/service.js';

const ORIGINAL_BYPASS = process.env.ODIE_CAREERS_DEV_BYPASS;
const ORIGINAL_ENV = process.env.NODE_ENV;

beforeAll(() => {
  process.env.ODIE_CAREERS_DEV_BYPASS = 'true';
  process.env.NODE_ENV = 'test';
});

afterAll(() => {
  process.env.ODIE_CAREERS_DEV_BYPASS = ORIGINAL_BYPASS;
  process.env.NODE_ENV = ORIGINAL_ENV;
});

describe('Odie Careers readiness service and routes', () => {
  it('returns framework-backed readiness plan', () => {
    const framework = getBaselineReadinessFramework('software-developer');
    expect(framework).toBeTruthy();
    expect(framework?.categories.some((category) => category.id === 'core-skills')).toBe(true);

    const plan = getReadinessPlanForCareer('student-a', 'software-developer');
    expect(plan?.career.id).toBe('software-developer');
    expect(plan?.categories.length).toBeGreaterThanOrEqual(5);
    expect(plan?.readinessScore.overall).toBeGreaterThanOrEqual(0);
  });

  it('returns null for unknown careers', () => {
    const plan = getReadinessPlanForCareer('student-a', 'unknown-career');
    expect(plan).toBeNull();
  });

  it('completes milestone and is idempotent', () => {
    const first = completeReadinessMilestone('student-a', 'software-developer', 'responsive-landing-page', {
      careerId: 'software-developer',
      evidence: [{
        type: 'project_link',
        title: 'Responsive Landing Page',
        url: 'https://github.com/example/project',
        description: 'Portfolio project',
      }],
      reflection: 'Learned deployment and responsive layouts.',
    });

    expect('success' in first && first.success).toBe(true);

    const second = completeReadinessMilestone('student-a', 'software-developer', 'responsive-landing-page', {
      careerId: 'software-developer',
      evidence: [{
        type: 'project_link',
        title: 'Responsive Landing Page',
        url: 'https://github.com/example/project',
      }],
    });

    expect('success' in second && second.success).toBe(true);
    if ('success' in second) {
      expect(second.idempotent).toBe(true);
    }
  });

  it('validates evidence for evidence-required milestones', () => {
    const result = completeReadinessMilestone('student-b', 'software-developer', 'responsive-landing-page', {
      careerId: 'software-developer',
      evidence: [],
    });

    expect('error' in result && result.error).toBe('evidence_required');
  });

  it('exposes readiness endpoints through routes', async () => {
    const app = await buildApp();

    const getPlan = await app.inject({
      method: 'GET',
      url: '/odie-careers/readiness/plan?careerId=software-developer&studentId=route-student',
    });
    expect(getPlan.statusCode).toBe(200);

    const complete = await app.inject({
      method: 'POST',
      url: '/odie-careers/readiness/milestone/responsive-landing-page/complete',
      payload: {
        careerId: 'software-developer',
        evidence: [{
          type: 'project_link',
          title: 'Landing Page',
          url: 'https://github.com/example/landing-page',
        }],
      },
    });
    expect(complete.statusCode).toBe(200);
    expect(complete.json().updatedReadinessScore.overall).toBeGreaterThanOrEqual(0);

    const unknownCareer = await app.inject({
      method: 'GET',
      url: '/odie-careers/readiness/plan?careerId=does-not-exist&studentId=route-student',
    });
    expect(unknownCareer.statusCode).toBe(404);

    await app.close();
  });
});
