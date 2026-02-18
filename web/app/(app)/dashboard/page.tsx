import nextDynamic from 'next/dynamic';
import { Card, CardTitle } from '@/components/ui/card';
import { StreakWidget } from '@/components/app/streak-widget';
import { apiGet } from '@/lib/server-api';
import { requireSession } from '@/lib/server-auth';

const StudentDashboardClient = nextDynamic(() => import('@/components/app/StudentDashboardClient'), { ssr: false });

export const dynamic = 'force-dynamic';

type DashboardPayload = {
  greeting: string;
  thisWeek: { minutesStudied: number; sessionsAttended: number; streakDays: number };
  streak: { current: number; longest: number; xp: number };
  today: {
    hasUpcoming: boolean;
    session?: { subject: string; startTime: string; mode: string; date: string };
    emptyState?: { title: string; ctaLabel: string; ctaHref: string };
  };
  recommendedNext: { title: string; description: string; action: string };
  progressSnapshot: Array<{ topic: string; completion: number }>;
  predictiveScore: { momentumScore: number; riskScore: number; reasons?: Array<{ label: string; detail: string }> } | null;
};

export default async function StudentDashboardPage() {
  await requireSession(['STUDENT', 'ADMIN']);
  const data = await apiGet<DashboardPayload>('/dashboard');

  return (
    <>
      <Card className="bg-gradient-to-br from-violet-500/15 to-sky-500/15">
        <CardTitle>{data.greeting}</CardTitle>
        <p className="text-sm text-ody-muted">Premium Academic OS student cockpit</p>
        <div className="mt-3 flex flex-wrap gap-2">
          <span className="ody-chip">Minutes: {data.thisWeek.minutesStudied}</span>
          <span className="ody-chip">Sessions: {data.thisWeek.sessionsAttended}</span>
          <span className="ody-chip">Streak: {data.thisWeek.streakDays}</span>
          <span className="ody-chip">Momentum: {data.predictiveScore?.momentumScore ?? 0}</span>
        </div>
      </Card>

      <div className="mt-4">
        <StudentDashboardClient initialData={data} />
      </div>
    </>
  );
}
