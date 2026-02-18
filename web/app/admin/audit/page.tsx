import nextDynamic from 'next/dynamic';
import { apiGet } from '@/lib/server-api';
import { requireSession } from '@/lib/server-auth';

const AuditClient = nextDynamic(() => import('@/components/admin/AuditClient'), { ssr: false });

export const dynamic = 'force-dynamic';

export default async function AuditPage() {
  await requireSession(['ADMIN']);
  const data = await apiGet<{ items: any[] }>('/admin/audit');

  return (
    <div>
      <h1 className="text-2xl font-semibold">Audit log</h1>
      <p className="text-ody-muted mt-2">View system audit events and change history.</p>
      <div className="mt-4">
        <AuditClient initialItems={data.items || []} />
      </div>
    </div>
  );
}
