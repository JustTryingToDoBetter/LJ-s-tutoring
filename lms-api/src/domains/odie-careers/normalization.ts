import type {
  ProfileSignal,
  StudentProfileSummary,
  StudentSubjectResult,
} from './types.js';

const SUBJECT_ALIASES: Record<string, string> = {
  english: 'English',
  'english hl': 'English',
  'english home language': 'English',
  'english fal': 'English',
  'english first additional language': 'English',
  mathematics: 'Mathematics',
  maths: 'Mathematics',
  math: 'Mathematics',
  'mathematical literacy': 'Mathematical Literacy',
  'maths literacy': 'Mathematical Literacy',
  'math literacy': 'Mathematical Literacy',
  'physical sciences': 'Physical Sciences',
  physics: 'Physical Sciences',
  'life sciences': 'Life Sciences',
  biology: 'Life Sciences',
  accounting: 'Accounting',
  'business studies': 'Business Studies',
  geography: 'Geography',
  history: 'History',
  'computer applications technology': 'Computer Applications Technology',
  cat: 'Computer Applications Technology',
  'information technology': 'Information Technology',
  it: 'Information Technology',
  economics: 'Economics',
  'life orientation': 'Life Orientation',
};

const SIGNAL_LABELS: Record<ProfileSignal, string> = {
  stem: 'STEM-aligned',
  business: 'Business-aligned',
  humanities: 'Humanities-aligned',
  health: 'Health-aligned',
};

function normalizedKey(value: string) {
  return value.trim().toLowerCase().replace(/\s+/g, ' ');
}

function titleCase(value: string) {
  return value
    .split(' ')
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(' ');
}

export function normalizeSubjectName(subject: string) {
  const key = normalizedKey(subject);
  return SUBJECT_ALIASES[key] ?? titleCase(key);
}

export function normalizeStudentSubjects(subjects: StudentSubjectResult[]) {
  const deduped = new Map<string, StudentSubjectResult>();

  subjects.forEach((subject) => {
    const canonical = normalizeSubjectName(subject.subject);
    const percentage = Math.max(0, Math.min(100, Number(subject.percentage ?? 0)));
    const existing = deduped.get(canonical);

    if (!existing || percentage > existing.percentage) {
      deduped.set(canonical, {
        subject: canonical,
        percentage,
      });
    }
  });

  return [...deduped.values()].sort((a, b) => b.percentage - a.percentage || a.subject.localeCompare(b.subject));
}

export function percentageToApsValue(percentage: number) {
  if (percentage >= 80) return 7;
  if (percentage >= 70) return 6;
  if (percentage >= 60) return 5;
  if (percentage >= 50) return 4;
  if (percentage >= 40) return 3;
  if (percentage >= 30) return 2;
  return 0;
}

export function calculateAps(subjects: StudentSubjectResult[]) {
  return normalizeStudentSubjects(subjects)
    .filter((subject) => subject.subject !== 'Life Orientation')
    .map((subject) => percentageToApsValue(subject.percentage))
    .sort((a, b) => b - a)
    .slice(0, 6)
    .reduce<number>((sum, value) => sum + value, 0);
}

export function averagePercentage(subjects: StudentSubjectResult[]) {
  const normalized = normalizeStudentSubjects(subjects);
  if (normalized.length === 0) return 0;
  const total = normalized.reduce((sum, subject) => sum + subject.percentage, 0);
  return Math.round(total / normalized.length);
}

function scoreSignals(subjects: StudentSubjectResult[]) {
  const scores: Record<ProfileSignal, number> = {
    stem: 0,
    business: 0,
    humanities: 0,
    health: 0,
  };

  subjects.forEach((subject) => {
    const { percentage } = subject;
    const name = normalizeSubjectName(subject.subject);

    if (name === 'Mathematics') {
      if (percentage >= 60) scores.stem += 2;
      if (percentage >= 55) scores.business += 1;
    }
    if (name === 'Mathematical Literacy' && percentage >= 65) {
      scores.business += 2;
    }
    if (name === 'Physical Sciences') {
      if (percentage >= 55) scores.stem += 2;
      if (percentage >= 50) scores.health += 1;
    }
    if (name === 'Information Technology' || name === 'Computer Applications Technology') {
      if (percentage >= 60) scores.stem += 1;
    }
    if (name === 'Accounting' || name === 'Business Studies' || name === 'Economics') {
      if (percentage >= 60) scores.business += 2;
    }
    if (name === 'English') {
      if (percentage >= 60) scores.humanities += 2;
      if (percentage >= 55) scores.health += 1;
    }
    if (name === 'History' || name === 'Geography') {
      if (percentage >= 60) scores.humanities += 2;
    }
    if (name === 'Life Sciences' && percentage >= 60) {
      scores.health += 2;
    }
  });

  return scores;
}

export function inferStrengthSignals(subjects: StudentSubjectResult[]) {
  const scores = scoreSignals(normalizeStudentSubjects(subjects));
  return Object.entries(scores)
    .filter(([, score]) => score >= 2)
    .sort((a, b) => b[1] - a[1])
    .map(([signal]) => signal as ProfileSignal);
}

function buildRouteSuggestions(signals: ProfileSignal[]) {
  const suggestions: string[] = [];

  if (signals.includes('stem')) {
    suggestions.push('You currently look strongest for IT, engineering, data, and technical diploma pathways.');
  }
  if (signals.includes('business')) {
    suggestions.push('Commerce, accounting, business management, and office administration routes fit your subject mix.');
  }
  if (signals.includes('humanities')) {
    suggestions.push('Social science, communication, education, and service-oriented programmes are a natural fit.');
  }
  if (signals.includes('health')) {
    suggestions.push('Health science and community health pathways are worth exploring if Life Sciences and English stay strong.');
  }

  if (suggestions.length === 0) {
    suggestions.push('Add a few more subjects or updated marks to surface stronger pathway signals.');
  }

  return suggestions.slice(0, 3);
}

export function buildStudentProfileSummary(subjects: StudentSubjectResult[]): StudentProfileSummary {
  const normalized = normalizeStudentSubjects(subjects);
  const signals = inferStrengthSignals(normalized);

  return {
    averagePercentage: averagePercentage(normalized),
    strongestSubjects: normalized.slice(0, 4),
    signals,
    signalLabels: signals.map((signal) => SIGNAL_LABELS[signal]),
    routeSuggestions: buildRouteSuggestions(signals),
  };
}
