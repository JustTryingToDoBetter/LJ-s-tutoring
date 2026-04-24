import { loadCareerDataset, loadCourseDataset, loadSourceManifest } from './data.js';
import { buildCareerForecast } from './forecast.js';
import { evaluateEligibility } from './eligibility.js';
import type {
  CareerDetail,
  CareerReadinessCategory,
  CareerReadinessFramework,
  CareerReadinessMilestone,
  CareerReadinessPlan,
  CareerReadinessScore,
  CareerReadinessSummary,
  CareerSummary,
  EligibilityEvaluation,
  OdieCareersOverview,
  ReadinessEvidenceInput,
  ReadinessMilestoneCompletePayload,
  ReadinessMilestoneCompletionResult,
  StudentProfile,
} from './types.js';

const READINESS_CATEGORY_WEIGHTS: Record<string, number> = {
  'core-skills': 0.3,
  'practical-projects': 0.3,
  communication: 0.15,
  'work-experience-proxies': 0.15,
  evidence: 0.1,
};

const STATUS_PROGRESS: Record<CareerReadinessMilestone['status'], number> = {
  not_started: 0,
  in_progress: 0.4,
  completed: 0.8,
  verified: 1,
};

const PRIORITY_MULTIPLIER: Record<CareerReadinessMilestone['priority'], number> = {
  low: 1,
  medium: 1.2,
  high: 1.4,
  critical: 1.6,
};

const EVIDENCE_TYPES = new Set([
  'project_link',
  'github_repo',
  'live_demo',
  'certificate',
  'challenge_completion',
  'assessment_score',
  'uploaded_file',
  'portfolio_case_study',
  'linkedin_post',
  'recommendation',
  'reflection',
]);

const studentReadinessStore = new Map<string, {
  statuses: Map<string, CareerReadinessMilestone['status']>;
  reflections: Map<string, string>;
  evidence: Map<string, CareerReadinessMilestone['evidenceItems']>;
}>();

function quantile(values: number[], percentile: number) {
  if (values.length === 0) return 0;
  const ordered = [...values].sort((a, b) => a - b);
  const index = Math.max(0, Math.min(ordered.length - 1, Math.round((ordered.length - 1) * percentile)));
  return ordered[index];
}

function demandLabel(score: number) {
  if (score >= 72) return 'High demand';
  if (score >= 55) return 'Stable demand';
  return 'Watch demand';
}

function growthLabel(score: number) {
  if (score >= 72) return 'Growing';
  if (score >= 55) return 'Steady';
  return 'Mixed';
}

function buildCareerSummary(record: ReturnType<typeof loadCareerDataset>['careers'][number]): CareerSummary {
  const salaries = record.metricSnapshots.map((snapshot) => snapshot.medianSalaryZar);
  const forecast = buildCareerForecast(record.metricSnapshots);

  return {
    id: record.id,
    title: record.title,
    description: record.description,
    category: record.category,
    salaryRange: {
      low: quantile(salaries, 0.1),
      median: quantile(salaries, 0.5),
      high: quantile(salaries, 0.9),
    },
    demandLabel: demandLabel(forecast.demandOutlookScore),
    growthLabel: growthLabel(forecast.forecastScore),
    pathCategories: record.institutionPathCategories,
    forecast,
  };
}

function getCareerById(careerId: string) {
  return loadCareerDataset().careers.find((item) => item.id === careerId) ?? null;
}

function createEvidenceMilestone(id: string, title: string, description: string, priority: CareerReadinessMilestone['priority'] = 'medium'): CareerReadinessMilestone {
  return {
    id,
    title,
    description,
    type: 'evidence',
    status: 'not_started',
    priority,
    estimatedHours: 2,
    evidenceRequired: true,
    evidenceItems: [],
  };
}

function getFrameworkTemplate(careerId: string): Omit<CareerReadinessFramework, 'id' | 'careerId' | 'title'> {
  const normalized = careerId.toLowerCase();

  if (normalized.includes('data-analyst')) {
    return {
      version: '1.0.0',
      categories: [
        {
          id: 'core-skills', title: 'Core Skills', description: 'Technical and analytical fundamentals for this role.', milestones: [
            { id: 'excel-sql-foundations', title: 'Master Excel + SQL foundations', description: 'Complete spreadsheet modeling and SQL querying drills.', type: 'skill', status: 'not_started', priority: 'high', estimatedHours: 8, evidenceRequired: true, evidenceItems: [] },
            { id: 'python-analysis-basics', title: 'Build Python data analysis workflow', description: 'Use pandas for cleaning, joins, and summary statistics.', type: 'skill', status: 'not_started', priority: 'high', estimatedHours: 8, evidenceRequired: true, evidenceItems: [] },
          ],
        },
        {
          id: 'practical-projects', title: 'Practical Projects', description: 'Project artifacts that prove applied analysis.', milestones: [
            { id: 'sql-case-study', title: 'Complete SQL case study', description: 'Analyze business questions with SQL and document findings.', type: 'project', status: 'not_started', priority: 'critical', estimatedHours: 6, evidenceRequired: true, evidenceItems: [] },
            { id: 'dashboard-story', title: 'Publish dashboard with narrative', description: 'Create a dashboard and concise insight summary.', type: 'project', status: 'not_started', priority: 'high', estimatedHours: 6, evidenceRequired: true, evidenceItems: [] },
          ],
        },
        {
          id: 'communication', title: 'Communication and Interview Prep', description: 'Communicate decisions and impact clearly.', milestones: [
            { id: 'star-project-walkthrough', title: 'Practice STAR project walkthrough', description: 'Explain one analysis project using STAR format.', type: 'communication', status: 'not_started', priority: 'medium', estimatedHours: 2, evidenceRequired: false, evidenceItems: [] },
          ],
        },
        {
          id: 'work-experience-proxies', title: 'Work Experience Proxies', description: 'Real-world simulation and collaboration.', milestones: [
            { id: 'peer-analytics-review', title: 'Complete peer analytics review', description: 'Review another analyst project and provide actionable feedback.', type: 'experience_proxy', status: 'not_started', priority: 'medium', estimatedHours: 2, evidenceRequired: true, evidenceItems: [] },
          ],
        },
        {
          id: 'evidence', title: 'Evidence Items', description: 'Organize evidence required for applications.', milestones: [
            createEvidenceMilestone('upload-portfolio-case-study', 'Upload one portfolio case study', 'Attach a polished portfolio narrative for one analysis project.', 'high'),
          ],
        },
      ],
    };
  }

  if (normalized.includes('cybersecurity')) {
    return {
      version: '1.0.0',
      categories: [
        {
          id: 'core-skills', title: 'Core Skills', description: 'Technical foundations for defensive security work.', milestones: [
            { id: 'networking-linux-basics', title: 'Complete networking + Linux essentials', description: 'Demonstrate OSI networking and Linux CLI operations.', type: 'skill', status: 'not_started', priority: 'high', estimatedHours: 8, evidenceRequired: true, evidenceItems: [] },
            { id: 'log-analysis-foundations', title: 'Practice SOC-style log analysis', description: 'Investigate logs and identify suspicious indicators.', type: 'skill', status: 'not_started', priority: 'high', estimatedHours: 6, evidenceRequired: true, evidenceItems: [] },
          ],
        },
        {
          id: 'practical-projects', title: 'Practical Projects', description: 'Hands-on security evidence projects.', milestones: [
            { id: 'ctf-writeup', title: 'Publish one CTF writeup', description: 'Capture reconnaissance, exploitation path, and lessons learned.', type: 'project', status: 'not_started', priority: 'critical', estimatedHours: 6, evidenceRequired: true, evidenceItems: [] },
          ],
        },
        {
          id: 'communication', title: 'Communication and Interview Prep', description: 'Communicate technical risk and mitigation clearly.', milestones: [
            { id: 'incident-star-story', title: 'Prepare incident response STAR story', description: 'Describe a simulated incident and response decisions.', type: 'communication', status: 'not_started', priority: 'medium', estimatedHours: 2, evidenceRequired: false, evidenceItems: [] },
          ],
        },
        {
          id: 'work-experience-proxies', title: 'Work Experience Proxies', description: 'Experience-like activities that show readiness.', milestones: [
            { id: 'home-lab-documentation', title: 'Document home lab setup', description: 'Publish architecture and test scenarios for a home lab.', type: 'experience_proxy', status: 'not_started', priority: 'high', estimatedHours: 4, evidenceRequired: true, evidenceItems: [] },
          ],
        },
        {
          id: 'evidence', title: 'Evidence Items', description: 'Proof artifacts for recruiters and hiring managers.', milestones: [
            createEvidenceMilestone('security-linkedin-post', 'Publish one security insight post', 'Share a concise finding or lesson on LinkedIn.', 'medium'),
          ],
        },
      ],
    };
  }

  return {
    version: '1.0.0',
    categories: [
      {
        id: 'core-skills', title: 'Core Skills', description: 'Technical fundamentals required for this role.', milestones: [
          { id: 'html-css-js-basics', title: 'Complete HTML, CSS, and JavaScript fundamentals', description: 'Build confidence with frontend building blocks and version control.', type: 'skill', status: 'not_started', priority: 'high', estimatedHours: 6, evidenceRequired: true, evidenceItems: [] },
          { id: 'react-component-practice', title: 'Build reusable React components', description: 'Practice state, props, and composition in a mini design system.', type: 'skill', status: 'not_started', priority: 'high', estimatedHours: 6, evidenceRequired: true, evidenceItems: [] },
        ],
      },
      {
        id: 'practical-projects', title: 'Practical Projects', description: 'Portfolio projects that demonstrate applied skills.', milestones: [
          { id: 'responsive-landing-page', title: 'Ship responsive landing page', description: 'Deploy one polished responsive page with mobile-first layout.', type: 'project', status: 'not_started', priority: 'critical', estimatedHours: 5, evidenceRequired: true, evidenceItems: [] },
          { id: 'api-dashboard-app', title: 'Build API-integrated dashboard app', description: 'Integrate third-party API data and deploy a dashboard UI.', type: 'project', status: 'not_started', priority: 'critical', estimatedHours: 8, evidenceRequired: true, evidenceItems: [] },
        ],
      },
      {
        id: 'communication', title: 'Communication and Interview Prep', description: 'Explain your value with confidence.', milestones: [
          { id: 'personal-pitch', title: 'Record a 60-second personal pitch', description: 'Summarize your strengths, projects, and role fit.', type: 'communication', status: 'not_started', priority: 'medium', estimatedHours: 2, evidenceRequired: false, evidenceItems: [] },
          { id: 'star-project-story', title: 'Create one STAR project story', description: 'Explain one project using situation, task, action, result.', type: 'communication', status: 'not_started', priority: 'medium', estimatedHours: 2, evidenceRequired: true, evidenceItems: [] },
        ],
      },
      {
        id: 'work-experience-proxies', title: 'Work Experience Proxies', description: 'Activities that simulate early experience.', milestones: [
          { id: 'open-source-contribution', title: 'Contribute one pull request', description: 'Submit at least one contribution with clear documentation.', type: 'experience_proxy', status: 'not_started', priority: 'high', estimatedHours: 4, evidenceRequired: true, evidenceItems: [] },
          { id: 'peer-code-review', title: 'Complete peer code review cycle', description: 'Review peer work and action the feedback on your own project.', type: 'experience_proxy', status: 'not_started', priority: 'medium', estimatedHours: 2, evidenceRequired: false, evidenceItems: [] },
        ],
      },
      {
        id: 'evidence', title: 'Evidence Items', description: 'Proof attached to milestones and portfolio profile.', milestones: [
          createEvidenceMilestone('portfolio-case-study', 'Publish one portfolio case study', 'Document architecture decisions, constraints, and outcomes.', 'high'),
          createEvidenceMilestone('linkedin-summary', 'Update LinkedIn summary', 'Align your public profile to target role outcomes.', 'low'),
        ],
      },
    ],
  };
}

function storageKey(studentId: string, careerId: string) {
  return `${studentId}::${careerId}`;
}

function ensureStudentProgress(studentId: string, careerId: string) {
  const key = storageKey(studentId, careerId);
  let record = studentReadinessStore.get(key);
  if (!record) {
    record = {
      statuses: new Map<string, CareerReadinessMilestone['status']>(),
      reflections: new Map<string, string>(),
      evidence: new Map<string, CareerReadinessMilestone['evidenceItems']>(),
    };
    studentReadinessStore.set(key, record);
  }
  return record;
}

function decorateMilestonesWithProgress(
  framework: CareerReadinessFramework,
  studentId: string,
): CareerReadinessCategory[] {
  const progress = ensureStudentProgress(studentId, framework.careerId);

  return framework.categories.map((category) => {
    const milestones = category.milestones.map((milestone) => {
      const status = progress.statuses.get(milestone.id) ?? milestone.status;
      const evidenceItems = progress.evidence.get(milestone.id) ?? milestone.evidenceItems;
      return { ...milestone, status, evidenceItems };
    });

    const completionPercentage = calculateCategoryCompletion(category.id, milestones);
    return {
      ...category,
      milestones,
      completionPercentage,
    };
  });
}

function calculateCategoryCompletion(categoryId: string, milestones: CareerReadinessMilestone[]): number {
  if (!milestones.length) return 0;
  let weightedTotal = 0;
  let weightedScore = 0;

  milestones.forEach((milestone) => {
    const priorityWeight = PRIORITY_MULTIPLIER[milestone.priority] ?? 1;
    const evidenceBonus = milestone.evidenceRequired
      ? (milestone.evidenceItems.length > 0 ? 1 : 0.6)
      : 1;
    const completion = STATUS_PROGRESS[milestone.status] ?? 0;
    weightedTotal += priorityWeight;
    weightedScore += priorityWeight * completion * evidenceBonus;
  });

  if (categoryId === 'evidence') {
    const withEvidence = milestones.filter((milestone) => milestone.evidenceItems.length > 0).length;
    const boost = milestones.length ? withEvidence / milestones.length : 0;
    return Math.round(Math.min(100, (weightedScore / weightedTotal) * 100 * (0.8 + (0.2 * boost))));
  }

  return Math.round(Math.min(100, (weightedScore / weightedTotal) * 100));
}

export function calculateReadinessScore(categories: CareerReadinessCategory[]): CareerReadinessScore {
  const values = {
    coreSkills: categories.find((category) => category.id === 'core-skills')?.completionPercentage ?? 0,
    projects: categories.find((category) => category.id === 'practical-projects')?.completionPercentage ?? 0,
    communication: categories.find((category) => category.id === 'communication')?.completionPercentage ?? 0,
    workExperienceProxies: categories.find((category) => category.id === 'work-experience-proxies')?.completionPercentage ?? 0,
    evidence: categories.find((category) => category.id === 'evidence')?.completionPercentage ?? 0,
  };

  const overall = Math.round(
    (values.coreSkills * READINESS_CATEGORY_WEIGHTS['core-skills'])
    + (values.projects * READINESS_CATEGORY_WEIGHTS['practical-projects'])
    + (values.communication * READINESS_CATEGORY_WEIGHTS.communication)
    + (values.workExperienceProxies * READINESS_CATEGORY_WEIGHTS['work-experience-proxies'])
    + (values.evidence * READINESS_CATEGORY_WEIGHTS.evidence)
  );

  return { overall, ...values };
}

export function generateWeeklyPlan(categories: CareerReadinessCategory[]) {
  const pending = categories
    .flatMap((category) => category.milestones.map((milestone) => ({
      ...milestone,
      categoryId: category.id,
      categoryTitle: category.title,
    })))
    .filter((milestone) => milestone.status !== 'verified' && milestone.status !== 'completed')
    .sort((a, b) => (PRIORITY_MULTIPLIER[b.priority] - PRIORITY_MULTIPLIER[a.priority]) || (a.estimatedHours - b.estimatedHours))
    .slice(0, 5);

  return [{
    week: 1,
    focus: pending.length ? 'Close your highest-impact readiness gaps' : 'Maintain momentum and verify completed evidence',
    tasks: pending.map((task) => ({
      id: task.id,
      title: task.title,
      category: task.categoryId,
      estimatedHours: task.estimatedHours,
      status: task.status,
    })),
  }];
}

export function getNextBestActions(categories: CareerReadinessCategory[]) {
  return categories
    .flatMap((category) => category.milestones
      .filter((milestone) => milestone.status !== 'verified')
      .map((milestone) => ({ category, milestone })))
    .sort((a, b) => PRIORITY_MULTIPLIER[b.milestone.priority] - PRIORITY_MULTIPLIER[a.milestone.priority])
    .slice(0, 4)
    .map(({ category, milestone }) => ({
      id: milestone.id,
      title: milestone.evidenceRequired && milestone.evidenceItems.length === 0
        ? `${milestone.title} and attach evidence`
        : milestone.title,
      reason: `${category.title} needs progress to improve entry-level readiness.`,
      impact: (milestone.priority === 'critical' || milestone.priority === 'high' ? 'high' : 'medium') as 'high' | 'medium',
    }));
}

export function getBaselineReadinessFramework(careerId: string): CareerReadinessFramework | null {
  const career = getCareerById(careerId);
  if (!career) return null;

  const template = getFrameworkTemplate(careerId);
  return {
    id: `framework-${career.id}-v${template.version}`,
    careerId: career.id,
    title: `${career.title} Entry Readiness`,
    version: template.version,
    categories: template.categories,
  };
}

export function getReadinessPlanForCareer(studentId: string, careerId: string): CareerReadinessPlan | null {
  const career = getCareerById(careerId);
  if (!career) return null;
  const framework = getBaselineReadinessFramework(careerId);
  if (!framework) return null;

  const categories = decorateMilestonesWithProgress(framework, studentId);
  const readinessScore = calculateReadinessScore(categories);

  return {
    career: {
      id: career.id,
      title: career.title,
      level: 'entry',
    },
    framework: {
      id: framework.id,
      title: framework.title,
      version: framework.version,
    },
    readinessScore,
    categories,
    weeklyPlan: generateWeeklyPlan(categories),
    nextActions: getNextBestActions(categories),
  };
}

function sanitizePlain(value: string | undefined, max = 600) {
  return (value ?? '')
    .replace(/[<>]/g, '')
    .trim()
    .slice(0, max);
}

function sanitizeEvidence(evidence: ReadinessEvidenceInput[]) {
  return evidence.map((item, index) => ({
    id: `evidence-${Date.now()}-${index}`,
    type: item.type,
    title: sanitizePlain(item.title, 120),
    url: sanitizePlain(item.url, 400),
    description: sanitizePlain(item.description, 500),
    verified: false,
  }));
}

function findMilestone(categories: CareerReadinessCategory[], milestoneId: string) {
  for (const category of categories) {
    const milestone = category.milestones.find((item) => item.id === milestoneId);
    if (milestone) return milestone;
  }
  return null;
}

export function completeReadinessMilestone(
  studentId: string,
  careerId: string,
  milestoneId: string,
  payload: ReadinessMilestoneCompletePayload,
): ReadinessMilestoneCompletionResult | { error: string; message?: string } {
  const plan = getReadinessPlanForCareer(studentId, careerId);
  if (!plan) {
    return { error: 'career_not_found' };
  }

  const milestone = findMilestone(plan.categories, milestoneId);
  if (!milestone) {
    return { error: 'milestone_not_found' };
  }

  const validEvidence = (payload.evidence ?? []).filter((item) => EVIDENCE_TYPES.has(item.type));
  const needsEvidence = milestone.evidenceRequired;
  const hasProvidedEvidence = validEvidence.length > 0 && validEvidence.every((item) => item.url.trim().length > 0);
  if (needsEvidence && !hasProvidedEvidence && milestone.evidenceItems.length === 0) {
    return { error: 'evidence_required', message: 'Evidence with valid urls is required for this milestone.' };
  }

  const progress = ensureStudentProgress(studentId, careerId);
  const alreadyDone = (progress.statuses.get(milestoneId) ?? milestone.status);

  if (validEvidence.length > 0) {
    const evidenceItems = sanitizeEvidence(validEvidence);
    progress.evidence.set(milestoneId, [...(progress.evidence.get(milestoneId) ?? []), ...evidenceItems]);
  }

  if (payload.reflection) {
    progress.reflections.set(milestoneId, sanitizePlain(payload.reflection, 1000));
  }

  if (alreadyDone !== 'verified') {
    progress.statuses.set(milestoneId, 'completed');
  }

  const updatedPlan = getReadinessPlanForCareer(studentId, careerId);
  if (!updatedPlan) {
    return { error: 'framework_unavailable' };
  }

  return {
    success: true,
    milestoneId,
    status: alreadyDone === 'verified' ? 'verified' : 'completed',
    idempotent: alreadyDone === 'completed' || alreadyDone === 'verified',
    updatedReadinessScore: updatedPlan.readinessScore,
  };
}

export function getOdieCareersOverview(): OdieCareersOverview {
  const careers = loadCareerDataset().careers;
  const courses = loadCourseDataset();
  const sources = loadSourceManifest();

  return {
    generatedAt: sources.lastRunAt,
    careers: careers.map((career) => buildCareerSummary(career)),
    institutions: courses.institutions,
    supportedSubjects: courses.supportedSubjects,
    stats: {
      careerCount: careers.length,
      courseCount: courses.courses.length,
      institutionCount: courses.institutions.length,
    },
    sourceSummary: {
      salary: 'Payscale South Africa job pages are the primary salary reference with cached normalization fallback.',
      courses: 'Institution programme pages are normalized into a cached first-entry course catalog for Cape Town options.',
    },
    sourceHealth: sources.documents,
  };
}

export function getCareerDetail(careerId: string): CareerDetail | null {
  const dataset = loadCareerDataset();
  const record = dataset.careers.find((item) => item.id === careerId);
  if (!record) return null;

  const summary = buildCareerSummary(record);
  return {
    ...summary,
    educationRoutes: record.educationRoutes,
    relatedCareers: record.relatedCareerIds
      .map((relatedId) => dataset.careers.find((item) => item.id === relatedId))
      .filter(Boolean)
      .map((item) => ({
        id: item!.id,
        title: item!.title,
        category: item!.category,
        growthLabel: growthLabel(buildCareerForecast(item!.metricSnapshots).forecastScore),
      })),
    timeToEnterMonths: record.timeToEnterMonths,
    futureSignals: record.futureSignals,
    metricSnapshots: record.metricSnapshots,
    sourceUrls: record.sourceUrls,
  };
}

export function searchCareerSummaries(query?: string) {
  const normalizedQuery = query?.trim().toLowerCase();
  const dataset = loadCareerDataset();
  const careers = dataset.careers
    .filter((career) => !normalizedQuery || career.title.toLowerCase().includes(normalizedQuery) || career.category.toLowerCase().includes(normalizedQuery))
    .map((career) => buildCareerSummary(career));

  return careers.sort((a, b) => a.title.localeCompare(b.title));
}

export function evaluateStudentProfile(profile: StudentProfile): EligibilityEvaluation {
  const { courses } = loadCourseDataset();
  return evaluateEligibility(profile, courses);
}

export function getReadinessSummary(careerId: string): CareerReadinessSummary | null {
  const framework = getBaselineReadinessFramework(careerId);
  if (!framework) return null;
  return {
    frameworkId: framework.id,
    version: framework.version,
    categoryCount: framework.categories.length,
  };
}
