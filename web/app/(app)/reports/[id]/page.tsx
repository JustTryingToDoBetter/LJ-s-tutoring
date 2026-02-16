import { Card, CardTitle } from '@/components/ui/card';
import { apiGet } from '@/lib/server-api';
import { requireSession } from '@/lib/server-auth';

export const dynamic = 'force-dynamic';

type ReportResponse = {
  report: {
    id: string;
    weekStart: string;
    weekEnd: string;
    payload: {
      student?: { name?: string; grade?: string };
      metrics?: { sessionsAttended?: number; timeStudiedMinutes?: number; streak?: number; xp?: number };
      topicProgress?: Array<{ topic: string; completion: number }>;
      tutorNotesSummary?: string[];
      goalsNextWeek?: string[];
    };
  };
};

export default async function ReportDetailPage({ params }: { params: { id: string } }) {
  await requireSession(['STUDENT', 'TUTOR', 'ADMIN']);
  const data = await apiGet<ReportResponse>(`/reports/${params.id}`);

  return (
    <Card>
      <CardTitle>Report {data.report.weekStart} → {data.report.weekEnd}</CardTitle>
      <p className="mt-2 text-sm text-ody-muted">Student: {data.report.payload.student?.name ?? 'Student'}</p>
      <div className="mt-3 flex flex-wrap gap-2 text-xs">
        <span className="ody-chip">Sessions {data.report.payload.metrics?.sessionsAttended ?? 0}</span>
        <span className="ody-chip">Minutes {data.report.payload.metrics?.timeStudiedMinutes ?? 0}</span>
        <span className="ody-chip">Streak {data.report.payload.metrics?.streak ?? 0}</span>
        <span className="ody-chip">XP {data.report.payload.metrics?.xp ?? 0}</span>
      </div>
    </Card>
  );
}
