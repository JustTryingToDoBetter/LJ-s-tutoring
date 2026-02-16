import { Card, CardTitle } from '@/components/ui/card';
import { StreakWidget } from '@/components/app/streak-widget';
import { apiGet } from '@/lib/server-api';
import { requireSession } from '@/lib/server-auth';

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

      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardTitle>Recommended next</CardTitle>
          <p className="mt-2 text-sm text-ody-muted">{data.recommendedNext.description}</p>
          <button className="ody-btn-primary mt-3">{data.recommendedNext.action}</button>
        </Card>

        <Card>
          <CardTitle>Upcoming session</CardTitle>
          {data.today.hasUpcoming && data.today.session ? (
            <p className="mt-2 text-sm text-ody-muted">
              {data.today.session.subject} • {data.today.session.startTime} • {data.today.session.mode}
            </p>
          ) : (
            <p className="mt-2 text-sm text-ody-muted">{data.today.emptyState?.title ?? 'No upcoming session'}</p>
          )}
        </Card>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardTitle>Topic progress</CardTitle>
          <div className="mt-3 grid gap-2">
            {data.progressSnapshot.map((topic) => (
              <div key={topic.topic}>
                <div className="mb-1 flex justify-between text-sm"><span>{topic.topic}</span><span>{topic.completion}%</span></div>
                <div className="h-2 rounded-full bg-slate-800">
                  <div className="h-2 rounded-full bg-ody-gradient" style={{ width: `${Math.max(0, Math.min(100, topic.completion))}%` }} />
                </div>
              </div>
            ))}
          </div>
        </Card>

        <StreakWidget streak={data.streak} />
      </div>
    </>
  );
}
