import nextDynamic from 'next/dynamic';
import { apiGet } from '@/lib/server-api';
import { requireSession } from '@/lib/server-auth';

const ReconciliationClient = nextDynamic(() => import('@/components/admin/ReconciliationClient'), { ssr: false });

export const dynamic = 'force-dynamic';

export default async function ReconciliationPage() {
  await requireSession(['ADMIN']);
  const data = await apiGet<{ items: any[] }>('/admin/reconciliation');

  return (
    <div>
      <h1 className="text-2xl font-semibold">Reconciliation</h1>
      <p className="text-ody-muted mt-2">Bank and payment reconciliation tools.</p>
      <div className="mt-4">
        <ReconciliationClient initialItems={data.items || []} />
      </div>
    </div>
  );
}
