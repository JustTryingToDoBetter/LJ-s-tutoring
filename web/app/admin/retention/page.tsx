import nextDynamic from 'next/dynamic';
import { apiGet } from '@/lib/server-api';
import { requireSession } from '@/lib/server-auth';

const RetentionClient = nextDynamic(() => import('@/components/admin/RetentionClient'), { ssr: false });

export const dynamic = 'force-dynamic';

export default async function RetentionPage() {
  await requireSession(['ADMIN']);
  const data = await apiGet<{ items: any[] }>('/admin/retention');

  return (
    <div>
      <h1 className="text-2xl font-semibold">Retention</h1>
      <p className="text-ody-muted mt-2">Manage retention events and deletion workflows.</p>
      <div className="mt-4">
        <RetentionClient initialItems={data.items || []} />
      </div>
    </div>
  );
}
