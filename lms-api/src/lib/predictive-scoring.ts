export type ScoreMetrics = {
  approvedSessions14: number;
  rejectedSessions14: number;
  streakCurrent: number;
  streakBreaks14: number;
  practiceEvents7: number;
  practiceMinutes7: number;
  topicTrendDelta: number;
  vaultEvents7: number;
  assistantEvents7: number;
  previousRiskScore?: number | null;
  previousMomentumScore?: number | null;
};

export type ScoreReason = {
  key: string;
  label: string;
  impact: 'HIGH' | 'MEDIUM' | 'LOW' | 'POSITIVE';
  value: number;
  detail: string;
};

export type ScoreResult = {
  riskScore: number;
  momentumScore: number;
  reasons: ScoreReason[];
  recommendedActions: Array<{ label: string; href: string }>;
  metrics: Record<string, number>;
};

const DEFAULT_SMOOTHING_ALPHA = 0.34;

function clamp(num: number, min = 0, max = 100) {
  return Math.max(min, Math.min(max, Math.round(num)));
}

function smooth(raw: number, previous: number | null | undefined, alpha = DEFAULT_SMOOTHING_ALPHA) {
  if (typeof previous !== 'number' || Number.isNaN(previous)) {
    return clamp(raw);
  }
  return clamp(alpha * raw + (1 - alpha) * previous);
}

function ratio(numerator: number, denominator: number) {
  if (denominator <= 0) return 0;
  return numerator / denominator;
}

export function computeScoreSnapshot(metrics: ScoreMetrics): ScoreResult {
  const totalSessions14 = metrics.approvedSessions14 + metrics.rejectedSessions14;
  const missedRate = ratio(metrics.rejectedSessions14, totalSessions14);
  const attendanceRisk = clamp(missedRate * 100);

  const streakRisk = clamp((metrics.streakCurrent <= 0 ? 100 : Math.max(0, 70 - metrics.streakCurrent * 8)) + metrics.streakBreaks14 * 8);

  const practiceFrequencyRisk = clamp(Math.max(0, 7 - metrics.practiceEvents7) * 12);
  const practiceMinutesRisk = clamp(Math.max(0, 140 - metrics.practiceMinutes7) * 0.45);
  const activityRisk = clamp((practiceFrequencyRisk * 0.6) + (practiceMinutesRisk * 0.4));

  const trendRisk = clamp(Math.max(0, (0.5 - metrics.topicTrendDelta) * 100));
  const engagementBuffer = clamp((metrics.vaultEvents7 + metrics.assistantEvents7) * 4, 0, 20);

  const rawRisk = clamp(
    attendanceRisk * 0.3 +
    streakRisk * 0.22 +
    activityRisk * 0.24 +
    trendRisk * 0.18 -
    engagementBuffer * 0.06
  );

  const rawMomentum = clamp(
    (100 - attendanceRisk) * 0.2 +
    clamp(metrics.streakCurrent * 10) * 0.24 +
    clamp(metrics.practiceEvents7 * 12) * 0.2 +
    clamp(metrics.practiceMinutes7 * 0.45) * 0.2 +
    clamp((metrics.topicTrendDelta + 1) * 50) * 0.1 +
    clamp((metrics.vaultEvents7 + metrics.assistantEvents7) * 6) * 0.06
  );

  const riskScore = smooth(rawRisk, metrics.previousRiskScore);
  const momentumScore = smooth(rawMomentum, metrics.previousMomentumScore);

  const reasons: ScoreReason[] = [];
  if (attendanceRisk >= 55) {
    reasons.push({
      key: 'attendance',
      label: 'Attendance risk elevated',
      impact: 'HIGH',
      value: attendanceRisk,
      detail: `${metrics.rejectedSessions14} missed/cancelled sessions in 14 days.`
    });
  }
  if (metrics.streakCurrent <= 1 || metrics.streakBreaks14 >= 2) {
    reasons.push({
      key: 'streak',
      label: 'Streak instability detected',
      impact: 'MEDIUM',
      value: metrics.streakCurrent,
      detail: `Current streak ${metrics.streakCurrent}, breaks in 14 days: ${metrics.streakBreaks14}.`
    });
  }
  if (metrics.practiceEvents7 <= 2 || metrics.practiceMinutes7 < 90) {
    reasons.push({
      key: 'practice',
      label: 'Practice consistency is low',
      impact: 'HIGH',
      value: metrics.practiceMinutes7,
      detail: `${metrics.practiceEvents7} activities and ${metrics.practiceMinutes7} minutes in 7 days.`
    });
  }
  if (metrics.topicTrendDelta < 0) {
    reasons.push({
      key: 'trend',
      label: 'Topic trend declined',
      impact: 'MEDIUM',
      value: metrics.topicTrendDelta,
      detail: `Weekly topic trend delta is ${metrics.topicTrendDelta.toFixed(2)}.`
    });
  }
  if (metrics.practiceEvents7 >= 5 && metrics.practiceMinutes7 >= 150 && metrics.streakCurrent >= 4) {
    reasons.push({
      key: 'momentum_positive',
      label: 'Strong momentum signal',
      impact: 'POSITIVE',
      value: momentumScore,
      detail: 'Consistent practice and streak are trending upward.'
    });
  }

  if (reasons.length === 0) {
    reasons.push({
      key: 'stable',
      label: 'Stable learning pattern',
      impact: 'LOW',
      value: momentumScore,
      detail: 'No major negative shifts detected this period.'
    });
  }

  const recommendedActions: Array<{ label: string; href: string }> = [];
  if (attendanceRisk >= 55) {
    recommendedActions.push({ label: 'Book/confirm next tutoring session', href: '/contact' });
  }
  if (metrics.practiceEvents7 <= 2) {
    recommendedActions.push({ label: 'Run a 25-minute focus session today', href: '/dashboard/' });
  }
  if (metrics.topicTrendDelta < 0) {
    recommendedActions.push({ label: 'Review weak topics in vault recommendations', href: '/dashboard/career/' });
  }
  if (recommendedActions.length === 0) {
    recommendedActions.push({ label: 'Keep your routine and submit one challenge', href: '/dashboard/community/' });
  }

  return {
    riskScore,
    momentumScore,
    reasons,
    recommendedActions,
    metrics: {
      approvedSessions14: metrics.approvedSessions14,
      rejectedSessions14: metrics.rejectedSessions14,
      streakCurrent: metrics.streakCurrent,
      streakBreaks14: metrics.streakBreaks14,
      practiceEvents7: metrics.practiceEvents7,
      practiceMinutes7: metrics.practiceMinutes7,
      topicTrendDelta: Number(metrics.topicTrendDelta.toFixed(4)),
      vaultEvents7: metrics.vaultEvents7,
      assistantEvents7: metrics.assistantEvents7,
    }
  };
}
