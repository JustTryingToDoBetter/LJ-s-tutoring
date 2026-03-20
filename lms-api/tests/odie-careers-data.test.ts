import { describe, expect, it } from 'vitest';
import { loadCareerDataset, loadCourseDataset } from '../src/domains/odie-careers/data.js';

describe('Odie Careers dataset integrity', () => {
  it('keeps related career references valid', () => {
    const { careers } = loadCareerDataset();
    const knownIds = new Set(careers.map((career) => career.id));

    careers.forEach((career) => {
      career.relatedCareerIds.forEach((relatedId) => {
        expect(knownIds.has(relatedId), `${career.id} -> ${relatedId}`).toBe(true);
      });
    });
  });

  it('keeps aligned career references valid for courses', () => {
    const { careers } = loadCareerDataset();
    const { courses, institutions } = loadCourseDataset();
    const knownCareerIds = new Set(careers.map((career) => career.id));
    const knownInstitutionIds = new Set(institutions.map((institution) => institution.id));

    courses.forEach((course) => {
      expect(knownInstitutionIds.has(course.institutionId), course.id).toBe(true);
      course.alignedCareerIds.forEach((careerId) => {
        expect(knownCareerIds.has(careerId), `${course.id} -> ${careerId}`).toBe(true);
      });
    });
  });
});
