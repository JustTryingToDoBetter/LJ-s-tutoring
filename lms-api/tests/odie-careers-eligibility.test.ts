import { describe, expect, it } from 'vitest';
import { evaluateEligibility } from '../src/domains/odie-careers/eligibility.js';
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
  it('marks courses eligible when the student meets thresholds', () => {
    const [engineering] = evaluateEligibility({
      subjects: [
        { subject: 'English', percentage: 65 },
        { subject: 'Mathematics', percentage: 61 },
        { subject: 'Physical Sciences', percentage: 58 },
        { subject: 'Geography', percentage: 62 },
      ],
    }, courses);

    expect(engineering.status).toBe('eligible');
    expect(engineering.missingRequirements).toHaveLength(0);
  });

  it('identifies close gaps and recommends improvements', () => {
    const results = evaluateEligibility({
      subjects: [
        { subject: 'English', percentage: 49 },
        { subject: 'Mathematics', percentage: 53 },
        { subject: 'Physical Sciences', percentage: 48 },
        { subject: 'Business Studies', percentage: 66 },
      ],
    }, courses);

    const engineering = results.find((item) => item.courseId === 'engineering');
    expect(engineering?.status).toBe('close');
    expect(engineering?.missingRequirements.some((gap) => gap.requirement === 'English')).toBe(true);
    expect(engineering?.recommendedActions.some((action) => action.includes('Improve English'))).toBe(true);
  });
});
