export type CapsSubject = {
  name: string;
  grades: number[];
};

export type GradeBand = 'GRADES_6_9' | 'GRADES_10_12' | 'BOTH';

const SUBJECTS: CapsSubject[] = [
  { name: 'Mathematics', grades: [6, 7, 8, 9, 10, 11, 12] },
  { name: 'Mathematical Literacy', grades: [10, 11, 12] },
  { name: 'Physical Sciences', grades: [10, 11, 12] },
  { name: 'Life Sciences', grades: [10, 11, 12] },
  { name: 'Accounting', grades: [10, 11, 12] },
  { name: 'English Home Language', grades: [6, 7, 8, 9, 10, 11, 12] },
  { name: 'Afrikaans Home Language', grades: [6, 7, 8, 9, 10, 11, 12] }
];

const SUBJECT_INDEX = new Map(SUBJECTS.map((entry) => [entry.name.toLowerCase(), entry]));

export function listCapsSubjects() {
  return SUBJECTS.map((entry) => ({
    name: entry.name,
    grades: entry.grades
  }));
}

export function parseGrade(value: string | null | undefined) {
  if (!value) return null;
  const match = String(value).match(/(\d{1,2})/);
  if (!match) return null;
  const grade = Number(match[1]);
  if (!Number.isFinite(grade) || grade < 1 || grade > 12) return null;
  return grade;
}

export function getGradeBand(grade: number): GradeBand | null {
  if (grade >= 6 && grade <= 9) return 'GRADES_6_9';
  if (grade >= 10 && grade <= 12) return 'GRADES_10_12';
  return null;
}

export function normalizeSubject(subject: string) {
  return subject.trim().toLowerCase();
}

export function isSubjectAllowedForGrade(subject: string, grade: number) {
  const entry = SUBJECT_INDEX.get(normalizeSubject(subject));
  if (!entry) return false;
  return entry.grades.includes(grade);
}

export function validateSubjectList(subjects: string[]) {
  const invalid: string[] = [];
  const normalized: string[] = [];
  subjects.forEach((subject) => {
    const raw = subject.trim();
    if (!raw) return;
    const entry = SUBJECT_INDEX.get(raw.toLowerCase());
    if (!entry) {
      invalid.push(subject);
      return;
    }
    normalized.push(entry.name);
  });
  return {
    invalid,
    normalized: Array.from(new Set(normalized))
  };
}

export function isTutorQualifiedForGradeBand(tutorBand: GradeBand, gradeBand: GradeBand) {
  if (tutorBand === 'BOTH') return true;
  if (tutorBand === 'GRADES_6_9') return gradeBand === 'GRADES_6_9';
  if (tutorBand === 'GRADES_10_12') return gradeBand === 'GRADES_10_12';
  return false;
}

export function isTutorQualifiedForSubject(subject: string, tutorSubjects: string[]) {
  const normalized = normalizeSubject(subject);
  return tutorSubjects.some((item) => normalizeSubject(item) === normalized);
}
