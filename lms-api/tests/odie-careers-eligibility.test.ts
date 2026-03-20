import { describe, expect, it } from 'vitest';
import { evaluateEligibility } from '../src/domains/odie-careers/eligibility.js';
import { buildStudentProfileSummary, calculateAps } from '../src/domains/odie-careers/normalization.js';
import type { CourseRecord } from '../src/domains/odie-careers/types.js';

const courses: CourseRecord[] = [
  {
    id: 'engineering',
    institutionId: 'inst-1',
    institutionName: 'Cape Tech',
    qualificationType: 'Diploma',
    programmeName: 'Diploma in Engineering',
    faculty: 'Engineering',
    institutionTypes: ['college_tvet'],
    alignedCareerIds: ['civil-engineering-technician'],
    alignmentTags: ['stem'],
    requirementConfidence: 'high',
    applicationNotes: ['Foundation maths support is available.'],
    sourceUrl: 'https://example.com/engineering',
    requirements: {
      minimumAps: 24,
      minimumEnglishPercentage: 50,
      subjectRequirements: [
        { label: 'Mathematics', acceptedSubjects: ['Mathematics'], minimumPercentage: 55 },
        { label: 'Physical Sciences', acceptedSubjects: ['Physical Sciences'], minimumPercentage: 50 },
      ],
      notes: [],
    },
  },
  {
    id: 'business',
    institutionId: 'inst-2',
    institutionName: 'Cape Business College',
    qualificationType: 'Higher Certificate',
    programmeName: 'Higher Certificate in Business Management',
    institutionTypes: ['private_institution'],
    alignedCareerIds: ['accountant'],
    alignmentTags: ['business'],
    requirementConfidence: 'medium',
    applicationNotes: ['Strong English improves readiness.'],
    sourceUrl: 'https://example.com/business',
    requirements: {
      minimumAps: 20,
      minimumEnglishPercentage: 50,
      subjectRequirements: [],
      notes: [],
    },
  },
];

describe('Odie Careers eligibility engine', () => {
  it('uses APS banding based on top six subjects', () => {
    const aps = calculateAps([
      { subject: 'English', percentage: 82 },
      { subject: 'Mathematics', percentage: 74 },
      { subject: 'Physical Sciences', percentage: 68 },
      { subject: 'Life Sciences', percentage: 63 },
      { subject: 'Geography', percentage: 59 },
      { subject: 'History', percentage: 48 },
      { subject: 'Life Orientation', percentage: 90 },
    ]);

    expect(aps).toBe(30);
  });

  it('marks courses eligible when the student meets thresholds', () => {
    const result = evaluateEligibility({
      subjects: [
        { subject: 'English', percentage: 72 },
        { subject: 'Mathematics', percentage: 66 },
        { subject: 'Physical Sciences', percentage: 61 },
        { subject: 'Geography', percentage: 68 },
        { subject: 'History', percentage: 64 },
        { subject: 'Life Sciences', percentage: 62 },
      ],
    }, courses);

    const engineering = result.results.find((item) => item.courseId === 'engineering');
    expect(result.aps).toBeGreaterThanOrEqual(24);
    expect(engineering?.status).toBe('eligible');
    expect(engineering?.missingRequirements).toHaveLength(0);
  });

  it('identifies close gaps and recommends improvements', () => {
    const result = evaluateEligibility({
      subjects: [
        { subject: 'English HL', percentage: 49 },
        { subject: 'Maths', percentage: 53 },
        { subject: 'Physical Sciences', percentage: 48 },
        { subject: 'Business Studies', percentage: 66 },
        { subject: 'Geography', percentage: 63 },
        { subject: 'History', percentage: 60 },
      ],
    }, courses);

    const engineering = result.results.find((item) => item.courseId === 'engineering');
    expect(engineering?.status).toBe('close');
    expect(engineering?.missingRequirements.some((gap) => gap.requirement === 'English')).toBe(true);
    expect(engineering?.recommendedActions.some((action) => action.includes('Improve English'))).toBe(true);
  });

  it('builds profile direction signals from normalized subjects', () => {
    const summary = buildStudentProfileSummary([
      { subject: 'Maths', percentage: 69 },
      { subject: 'Physical Sciences', percentage: 66 },
      { subject: 'CAT', percentage: 73 },
      { subject: 'English Home Language', percentage: 64 },
    ]);

    expect(summary.signals).toContain('stem');
    expect(summary.signalLabels).toContain('STEM-aligned');
  });
});
