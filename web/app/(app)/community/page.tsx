import { Card, CardTitle } from '@/components/ui/card';
import { apiGet } from '@/lib/server-api';
import { requireSession } from '@/lib/server-auth';

export const dynamic = 'force-dynamic';

type CommunityResponse = {
  items: Array<{ id: string; subject: string; grade?: string; member_count?: number }>;
};

type RiskResponse = {
  items: Array<{ studentName: string; riskScore: number | null; momentumScore: number | null }>;
};

export default async function CommunityPage() {
  const session = await requireSession(['STUDENT', 'TUTOR', 'ADMIN']);
  const rooms = await apiGet<CommunityResponse>('/community/rooms?page=1&pageSize=10');
  const risk = session.user.role === 'TUTOR' || session.user.role === 'ADMIN'
    ? await apiGet<RiskResponse>('/tutor/scores?page=1&pageSize=10').catch(() => ({ items: [] }))
    : { items: [] as RiskResponse['items'] };

  return (
    <div className="grid gap-4 lg:grid-cols-2">
      <Card>
        <CardTitle>Community rooms</CardTitle>
        <div className="mt-3 grid gap-2">
          {rooms.items.map((room) => (
            <div key={room.id} className="rounded-lg border border-ody-border px-3 py-2 text-sm">
              <p className="font-medium">{room.subject}{room.grade ? ` • ${room.grade}` : ''}</p>
              <p className="text-ody-muted">Members: {room.member_count ?? 0}</p>
            </div>
          ))}
        </div>
      </Card>

      <Card>
        <CardTitle>Risk + momentum</CardTitle>
        <div className="mt-3 grid gap-2">
          {risk.items.length === 0 && <p className="text-sm text-ody-muted">Visible for tutor/admin roles after assignment mapping.</p>}
          {risk.items.map((row) => (
            <div key={row.studentName} className="rounded-lg border border-ody-border px-3 py-2 text-sm">
              <p className="font-medium">{row.studentName}</p>
              <p className="text-ody-muted">Risk {row.riskScore ?? '-'} • Momentum {row.momentumScore ?? '-'}</p>
            </div>
          ))}
        </div>
      </Card>
    </div>
  );
}
