import Link from 'next/link';
import { Card, CardTitle } from '@/components/ui/card';
import { apiGet } from '@/lib/server-api';
import { requireSession } from '@/lib/server-auth';

export const dynamic = 'force-dynamic';

type ReportsResponse = {
  items: Array<{ id: string; week_start: string; week_end: string; created_at: string; student_name?: string }>;
};

export default async function ReportsPage() {
  await requireSession(['STUDENT', 'TUTOR', 'ADMIN']);
  const data = await apiGet<ReportsResponse>('/reports?page=1&pageSize=20');

  return (
    <Card>
      <CardTitle>Weekly reports</CardTitle>
      <div className="mt-3 grid gap-2">
        {data.items.map((item) => (
          <div key={item.id} className="flex items-center justify-between rounded-lg border border-ody-border px-3 py-2 text-sm">
            <div>
              <p className="font-medium">{item.week_start} → {item.week_end}</p>
              <p className="text-ody-muted">{new Date(item.created_at).toLocaleString()}</p>
            </div>
            <Link className="ody-btn-secondary" href={`/reports/${item.id}`}>View</Link>
          </div>
        ))}
      </div>
    </Card>
  );
}
