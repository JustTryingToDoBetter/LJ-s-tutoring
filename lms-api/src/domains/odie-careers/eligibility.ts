import type {
  CourseRecord,
  EligibilityGap,
  EligibilityResult,
  QualificationStatus,
  StudentProfile,
  StudentSubjectResult,
  SubjectRequirement,
} from './types.js';

function clamp(value: number, min: number, max: number) {
  return Math.max(min, Math.min(max, value));
}

function normalizeSubjectName(subject: string) {
  return subject.trim().toLowerCase().replace(/\s+/g, ' ');
}

export function calculateAps(subjects: StudentSubjectResult[]) {
  return subjects.reduce((sum, subject) => sum + Math.ceil(clamp(subject.percentage, 0, 100) / 10), 0);
}

function averagePercentage(subjects: StudentSubjectResult[]) {
  if (subjects.length === 0) return 0;
  return Math.round(subjects.reduce((sum, subject) => sum + subject.percentage, 0) / subjects.length);
}

function findBestMatch(subjects: StudentSubjectResult[], requirement: SubjectRequirement) {
  const normalizedAccepted = requirement.acceptedSubjects.map(normalizeSubjectName);
  const matches = subjects.filter((subject) => normalizedAccepted.includes(normalizeSubjectName(subject.subject)));
  if (matches.length === 0) return null;
  return matches.sort((a, b) => b.percentage - a.percentage)[0];
}

function buildSubjectGap(requirement: SubjectRequirement, currentValue: number | null): EligibilityGap {
  return {
    type: 'subject',
    requirement: requirement.label,
    currentValue,
    targetValue: requirement.minimumPercentage,
    message: currentValue == null
      ? `Add ${requirement.label} with at least ${requirement.minimumPercentage}% or choose an aligned pathway that does not require it.`
      : `Improve ${requirement.label} from ${currentValue}% to ${requirement.minimumPercentage}%.`,
  };
}

function inferStrengthSignals(subjects: StudentSubjectResult[]) {
  const signals = new Set<string>();
  subjects.forEach((subject) => {
    const name = normalizeSubjectName(subject.subject);
    const strong = subject.percentage >= 65;
    if (!strong) return;
    if (['mathematics', 'physical sciences', 'information technology', 'computer applications technology'].includes(name)) {
      signals.add('stem');
    }
    if (['accounting', 'business studies', 'economics', 'mathematical literacy'].includes(name)) {
      signals.add('business');
    }
    if (['english', 'history', 'geography', 'life sciences'].includes(name)) {
      signals.add('humanities');
    }
  });
  return signals;
}

function buildRecommendedActions(course: CourseRecord, gaps: EligibilityGap[], alternativeCourses: CourseRecord[]) {
  const actions = gaps.map((gap) => gap.message);
  if (course.applicationNotes.length > 0) {
    actions.push(course.applicationNotes[0]);
  }
  const alternative = alternativeCourses[0];
  if (alternative) {
    actions.push(`Consider ${alternative.programmeName} at ${alternative.institutionName} as an adjacent first-entry option while you improve requirements.`);
  }
  return [...new Set(actions)].slice(0, 4);
}

export function evaluateEligibility(profile: StudentProfile, courses: CourseRecord[]): EligibilityResult[] {
  const subjects = profile.subjects
    .map((subject) => ({ subject: subject.subject.trim(), percentage: clamp(subject.percentage, 0, 100) }))
    .filter((subject) => subject.subject.length > 0);
  const aps = calculateAps(subjects);
  const overall = averagePercentage(subjects);
  const english = subjects.find((subject) => normalizeSubjectName(subject.subject) === 'english')?.percentage ?? null;
  const strengths = inferStrengthSignals(subjects);

  return courses.map((course) => {
    const gaps: EligibilityGap[] = [];

    for (const requirement of course.requirements.subjectRequirements) {
      const match = findBestMatch(subjects, requirement);
      if (!match || match.percentage < requirement.minimumPercentage) {
        gaps.push(buildSubjectGap(requirement, match?.percentage ?? null));
      }
    }

    if (course.requirements.minimumAps != null && aps < course.requirements.minimumAps) {
      gaps.push({
        type: 'aps',
        requirement: 'APS',
        currentValue: aps,
        targetValue: course.requirements.minimumAps,
        message: `Lift your APS from ${aps} to ${course.requirements.minimumAps} by improving your strongest ladder subjects.`
      });
    }

    if (course.requirements.minimumOverallPercentage != null && overall < course.requirements.minimumOverallPercentage) {
      gaps.push({
        type: 'overall',
        requirement: 'Overall average',
        currentValue: overall,
        targetValue: course.requirements.minimumOverallPercentage,
        message: `Raise your overall average from ${overall}% to ${course.requirements.minimumOverallPercentage}%.`
      });
    }

    if (course.requirements.minimumEnglishPercentage != null && (english ?? -1) < course.requirements.minimumEnglishPercentage) {
      gaps.push({
        type: 'english',
        requirement: 'English',
        currentValue: english,
        targetValue: course.requirements.minimumEnglishPercentage,
        message: english == null
          ? `Add English with at least ${course.requirements.minimumEnglishPercentage}% for this route.`
          : `Improve English from ${english}% to ${course.requirements.minimumEnglishPercentage}%.`
      });
    }

    const alignedSignals = course.alignmentTags.filter((tag) => strengths.has(tag));
    const alignmentScore = clamp((alignedSignals.length * 24) + (course.alignedCareerIds.length * 4) + (gaps.length === 0 ? 20 : Math.max(0, 14 - gaps.length * 5)), 5, 98);

    let status: QualificationStatus = 'not_eligible';
    if (gaps.length === 0) status = 'eligible';
    else if (gaps.every((gap) => (gap.targetValue - (gap.currentValue ?? 0)) <= 6)) status = 'close';

    const alternativeCourses = courses.filter((candidate) => (
      candidate.id !== course.id
      && candidate.alignmentTags.some((tag) => course.alignmentTags.includes(tag))
      && (candidate.requirements.minimumAps ?? 0) <= (course.requirements.minimumAps ?? 99)
    ));

    return {
      courseId: course.id,
      institutionName: course.institutionName,
      programmeName: course.programmeName,
      qualificationType: course.qualificationType,
      faculty: course.faculty,
      status,
      alignmentScore,
      alignedSignals,
      minimumRequirements: course.requirements,
      requirementConfidence: course.requirementConfidence,
      missingRequirements: gaps,
      recommendedActions: buildRecommendedActions(course, gaps, alternativeCourses),
      sourceUrl: course.sourceUrl,
    } satisfies EligibilityResult;
  }).sort((a, b) => {
    const statusRank: Record<QualificationStatus, number> = { eligible: 0, close: 1, not_eligible: 2 };
    return statusRank[a.status] - statusRank[b.status] || b.alignmentScore - a.alignmentScore || a.institutionName.localeCompare(b.institutionName);
  });
}
