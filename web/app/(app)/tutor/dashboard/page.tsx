import { Card, CardTitle } from '@/components/ui/card';
import { apiGet } from '@/lib/server-api';
import { requireSession } from '@/lib/server-auth';

export const dynamic = 'force-dynamic';

type TutorDashboardPayload = {
  todaySessions: Array<{ id: string; time: string; studentName: string; status: string }>;
  studentsNeedingAttention: Array<{ studentId: string; studentName: string; currentStreak: number; riskScore: number | null; momentumScore: number | null; reasons: string[] }>;
  quickTools: Array<{ id: string; label: string; href: string }>;
};

export default async function TutorDashboardPage() {
  await requireSession(['TUTOR', 'ADMIN']);
  const data = await apiGet<TutorDashboardPayload>('/tutor/dashboard');

  return (
    <>
      <Card className="bg-gradient-to-br from-violet-500/15 to-sky-500/15">
        <CardTitle>Tutor operations</CardTitle>
        <div className="mt-3 flex flex-wrap gap-2">
          <span className="ody-chip">Today sessions: {data.todaySessions.length}</span>
          <span className="ody-chip">Attention queue: {data.studentsNeedingAttention.length}</span>
        </div>
      </Card>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardTitle>Today’s sessions</CardTitle>
          <div className="mt-3 grid gap-2">
            {data.todaySessions.map((item) => (
              <div key={item.id} className="rounded-lg border border-ody-border px-3 py-2 text-sm">
                <p className="font-medium">{item.time} • {item.studentName}</p>
                <p className="text-ody-muted">{item.status}</p>
              </div>
            ))}
          </div>
        </Card>

        <Card>
          <CardTitle>Students needing attention</CardTitle>
          <div className="mt-3 grid gap-2">
            {data.studentsNeedingAttention.map((item) => (
              <div key={item.studentId} className="rounded-lg border border-ody-border px-3 py-2 text-sm">
                <p className="font-medium">{item.studentName}</p>
                <p className="text-ody-muted">Risk {item.riskScore ?? '-'} • Momentum {item.momentumScore ?? '-'}</p>
              </div>
            ))}
          </div>
        </Card>
      </div>
    </>
  );
}
