import nextDynamic from 'next/dynamic';
import { apiGet } from '@/lib/server-api';
import { requireSession } from '@/lib/server-auth';

const ApprovalsClient = nextDynamic(() => import('@/components/admin/ApprovalsClient'), { ssr: false });

export const dynamic = 'force-dynamic';

export default async function ApprovalsPage() {
  await requireSession(['ADMIN']);
  const data = await apiGet<{ items: any[] }>('/admin/approvals');

  return (
    <div>
      <h1 className="text-2xl font-semibold">Approvals</h1>
      <p className="text-ody-muted mt-2">Approve or reject session payouts and bulk actions.</p>
      <div className="mt-4">
        <ApprovalsClient initialItems={data.items || []} />
      </div>
    </div>
  );
}
