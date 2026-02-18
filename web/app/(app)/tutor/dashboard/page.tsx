import nextDynamic from 'next/dynamic';
import { Card, CardTitle } from '@/components/ui/card';
import { apiGet } from '@/lib/server-api';
import { requireSession } from '@/lib/server-auth';

const TutorDashboardClient = nextDynamic(() => import('@/components/app/TutorDashboardClient'), { ssr: false });

export const dynamic = 'force-dynamic';

type TutorDashboardPayload = {
  todaySessions: Array<{ id: string; time: string; studentName: string; status: string; quickActions?: Array<{ label: string; href: string }> }>;
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

      <div className="mt-4">
        <TutorDashboardClient initialData={data} />
      </div>
    </>
  );
}
