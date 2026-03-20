import {
  averagePercentage,
  buildStudentProfileSummary,
  calculateAps,
  inferStrengthSignals,
  normalizeStudentSubjects,
  normalizeSubjectName,
} from './normalization.js';
import type {
  CourseRecord,
  EligibilityEvaluation,
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

function findBestMatch(subjects: StudentSubjectResult[], requirement: SubjectRequirement) {
  const acceptedSubjects = new Set(requirement.acceptedSubjects.map((subject) => normalizeSubjectName(subject)));
  const matches = subjects.filter((subject) => acceptedSubjects.has(normalizeSubjectName(subject.subject)));

  if (matches.length === 0) {
    return null;
  }

  return matches.sort((a, b) => b.percentage - a.percentage)[0];
}

function buildSubjectGap(requirement: SubjectRequirement, currentValue: number | null): EligibilityGap {
  return {
    type: 'subject',
    requirement: requirement.label,
    currentValue,
    targetValue: requirement.minimumPercentage,
    message: currentValue == null
      ? `Add ${requirement.label} with at least ${requirement.minimumPercentage}% or choose an aligned route that does not require it.`
      : `Improve ${requirement.label} from ${currentValue}% to ${requirement.minimumPercentage}%.`,
  };
}

function getShortfall(gap: EligibilityGap) {
  if (gap.currentValue == null) {
    return Number.POSITIVE_INFINITY;
  }
  return Math.max(0, gap.targetValue - gap.currentValue);
}

function classifyStatus(gaps: EligibilityGap[]) {
  if (gaps.length === 0) {
    return 'eligible' satisfies QualificationStatus;
  }

  const closeEnough = gaps.length <= 3 && gaps.every((gap) => {
    if (gap.currentValue == null) {
      return false;
    }

    if (gap.type === 'aps') {
      return getShortfall(gap) <= 3;
    }

    return getShortfall(gap) <= 5;
  });

  return closeEnough ? 'close' : 'not_eligible';
}

function buildAlternativePool(course: CourseRecord, courses: CourseRecord[]) {
  return courses.filter((candidate) => (
    candidate.id !== course.id
    && candidate.alignmentTags.some((tag) => course.alignmentTags.includes(tag))
    && (candidate.requirements.minimumAps ?? 0) <= ((course.requirements.minimumAps ?? 0) + 4)
    && candidate.requirements.subjectRequirements.length <= course.requirements.subjectRequirements.length
  ));
}

function buildRecommendedActions(course: CourseRecord, gaps: EligibilityGap[], alternativeCourses: CourseRecord[]) {
  const actions = gaps.map((gap) => gap.message);

  if (course.applicationNotes.length > 0) {
    actions.push(course.applicationNotes[0]);
  }

  const alternative = alternativeCourses[0];
  if (alternative) {
    actions.push(`Consider ${alternative.programmeName} at ${alternative.institutionName} as an adjacent first-entry option while you improve your marks.`);
  }

  if (course.institutionTypes.includes('college_tvet')) {
    actions.push('Use the college route to build marks, practical readiness, and progression options into diploma study.');
  }

  return [...new Set(actions)].slice(0, 5);
}

function buildAlignedSignalLabels(signalKeys: string[]) {
  return signalKeys.map((signal) => {
    if (signal === 'stem') return 'STEM';
    if (signal === 'business') return 'Business';
    if (signal === 'humanities') return 'Humanities';
    if (signal === 'health') return 'Health';
    return signal;
  });
}

export function evaluateEligibility(profile: StudentProfile, courses: CourseRecord[]): EligibilityEvaluation {
  const subjects = normalizeStudentSubjects(profile.subjects);
  const aps = calculateAps(subjects);
  const overall = averagePercentage(subjects);
  const english = subjects.find((subject) => normalizeSubjectName(subject.subject) === 'English')?.percentage ?? null;
  const profileSummary = buildStudentProfileSummary(subjects);
  const strengths = new Set(inferStrengthSignals(subjects).map(String));

  const results = courses.map((course) => {
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
        message: `Lift your APS from ${aps} to ${course.requirements.minimumAps} by improving your top six subjects.`,
      });
    }

    if (course.requirements.minimumOverallPercentage != null && overall < course.requirements.minimumOverallPercentage) {
      gaps.push({
        type: 'overall',
        requirement: 'Overall average',
        currentValue: overall,
        targetValue: course.requirements.minimumOverallPercentage,
        message: `Raise your overall average from ${overall}% to ${course.requirements.minimumOverallPercentage}%.`,
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
          : `Improve English from ${english}% to ${course.requirements.minimumEnglishPercentage}%.`,
      });
    }

    const alignedSignals = course.alignmentTags.filter((tag) => strengths.has(tag));
    const status = classifyStatus(gaps);
    const alternativeCourses = buildAlternativePool(course, courses);
    const alignmentScore = clamp(
      26
      + alignedSignals.length * 22
      + profileSummary.strongestSubjects.filter((subject) => course.requirements.subjectRequirements.some((requirement) => (
        requirement.acceptedSubjects.map((accepted) => normalizeSubjectName(accepted)).includes(normalizeSubjectName(subject.subject))
      ))).length * 8
      + (status === 'eligible' ? 12 : 0)
      - gaps.length * 6,
      5,
      98
    );

    return {
      courseId: course.id,
      institutionName: course.institutionName,
      programmeName: course.programmeName,
      qualificationType: course.qualificationType,
      faculty: course.faculty,
      institutionTypes: course.institutionTypes,
      status,
      alignmentScore,
      alignedSignals: buildAlignedSignalLabels(alignedSignals),
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

  return {
    aps,
    averagePercentage: overall,
    profileSummary,
    results,
  };
}
