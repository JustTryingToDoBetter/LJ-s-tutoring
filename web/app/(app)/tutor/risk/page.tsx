import { Card, CardTitle } from '@/components/ui/card';
import { apiGet } from '@/lib/server-api';
import { requireSession } from '@/lib/server-auth';

export const dynamic = 'force-dynamic';

type RiskResponse = {
  items: Array<{ studentId: string; studentName: string; riskScore: number | null; momentumScore: number | null; reasons: Array<{ label: string }> }>;
};

export default async function TutorRiskPage() {
  await requireSession(['TUTOR', 'ADMIN']);
  const data = await apiGet<RiskResponse>('/tutor/scores?page=1&pageSize=25');

  return (
    <Card>
      <CardTitle>Risk + momentum monitor</CardTitle>
      <div className="mt-3 grid gap-2">
        {data.items.map((item) => (
          <div key={item.studentId} className="rounded-lg border border-ody-border px-3 py-2 text-sm">
            <p className="font-medium">{item.studentName}</p>
            <p className="text-ody-muted">Risk {item.riskScore ?? '-'} • Momentum {item.momentumScore ?? '-'}</p>
          </div>
        ))}
      </div>
    </Card>
  );
}
