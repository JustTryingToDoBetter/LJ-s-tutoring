export type TrendDirection = 'up' | 'flat' | 'down';
export type ForecastLabel = 'strong_positive' | 'positive' | 'steady' | 'watchlist';
export type ConfidenceLabel = 'high' | 'medium' | 'low';
export type QualificationStatus = 'eligible' | 'close' | 'not_eligible';
export type InstitutionType = 'university' | 'college_tvet' | 'public_institution' | 'private_institution';
export type ProfileSignal = 'stem' | 'business' | 'humanities' | 'health';

export interface CareerMetricSnapshot {
  year: number;
  medianSalaryZar: number;
  salarySource: string;
  demandScore: number;
  growthSignal: number;
}

export interface CareerRecord {
  id: string;
  title: string;
  description: string;
  category: string;
  relatedCareerIds: string[];
  educationRoutes: string[];
  institutionPathCategories: InstitutionType[];
  timeToEnterMonths: { min: number; max: number };
  futureSignals: string[];
  sourceUrls: string[];
  metricSnapshots: CareerMetricSnapshot[];
}

export interface CareerForecast {
  direction: TrendDirection;
  label: ForecastLabel;
  confidence: ConfidenceLabel;
  demandOutlookScore: number;
  salaryTrendScore: number;
  forecastScore: number;
  summary: string;
  explainers: string[];
}

export interface CareerSummary {
  id: string;
  title: string;
  description: string;
  category: string;
  salaryRange: {
    low: number;
    median: number;
    high: number;
  };
  demandLabel: string;
  growthLabel: string;
  pathCategories: InstitutionType[];
  forecast: CareerForecast;
}

export interface CareerDetail extends CareerSummary {
  educationRoutes: string[];
  relatedCareers: Array<Pick<CareerSummary, 'id' | 'title' | 'category' | 'growthLabel'>>;
  timeToEnterMonths: { min: number; max: number };
  futureSignals: string[];
  metricSnapshots: CareerMetricSnapshot[];
  sourceUrls: string[];
}

export interface SubjectRequirement {
  label: string;
  acceptedSubjects: string[];
  minimumPercentage: number;
  notes?: string;
}

export interface CourseRequirement {
  minimumAps?: number;
  minimumOverallPercentage?: number;
  minimumEnglishPercentage?: number;
  subjectRequirements: SubjectRequirement[];
  notes: string[];
}

export interface CourseRecord {
  id: string;
  institutionId: string;
  institutionName: string;
  qualificationType: string;
  programmeName: string;
  faculty?: string;
  institutionTypes: InstitutionType[];
  alignedCareerIds: string[];
  alignmentTags: string[];
  requirementConfidence: ConfidenceLabel;
  applicationNotes: string[];
  sourceUrl: string;
  requirements: CourseRequirement;
}

export interface InstitutionRecord {
  id: string;
  name: string;
  city: string;
  institutionTypes: InstitutionType[];
  sourceUrl: string;
}

export interface StudentSubjectResult {
  subject: string;
  percentage: number;
}

export interface StudentProfile {
  subjects: StudentSubjectResult[];
}

export interface StudentProfileSummary {
  averagePercentage: number;
  strongestSubjects: StudentSubjectResult[];
  signals: ProfileSignal[];
  signalLabels: string[];
  routeSuggestions: string[];
}

export interface EligibilityGap {
  type: 'subject' | 'aps' | 'overall' | 'english';
  requirement: string;
  currentValue: number | null;
  targetValue: number;
  message: string;
}

export interface EligibilityResult {
  courseId: string;
  institutionName: string;
  programmeName: string;
  qualificationType: string;
  faculty?: string;
  institutionTypes: InstitutionType[];
  status: QualificationStatus;
  alignmentScore: number;
  alignedSignals: string[];
  minimumRequirements: CourseRequirement;
  requirementConfidence: ConfidenceLabel;
  missingRequirements: EligibilityGap[];
  recommendedActions: string[];
  sourceUrl: string;
}

export interface EligibilityEvaluation {
  aps: number;
  averagePercentage: number;
  profileSummary: StudentProfileSummary;
  results: EligibilityResult[];
}

export interface OdieCareersOverview {
  generatedAt: string;
  careers: CareerSummary[];
  institutions: InstitutionRecord[];
  supportedSubjects: string[];
  stats: {
    careerCount: number;
    courseCount: number;
    institutionCount: number;
  };
  sourceSummary: {
    salary: string;
    courses: string;
  };
  sourceHealth: CachedSourceDocument[];
}

export interface CachedSourceDocument {
  providerKey: string;
  label: string;
  area: 'salary' | 'institution';
  url: string;
  fetchedAt: string;
  status: 'ok' | 'fallback';
  statusCode?: number;
  notes?: string;
}
