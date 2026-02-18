import nextDynamic from 'next/dynamic';
import { apiGet } from '@/lib/server-api';
import { requireSession } from '@/lib/server-auth';

const PrivacyRequestsClient = nextDynamic(() => import('@/components/admin/PrivacyRequestsClient'), { ssr: false });

export const dynamic = 'force-dynamic';

export default async function PrivacyRequestsPage() {
  await requireSession(['ADMIN']);
  const data = await apiGet<{ items: any[] }>('/admin/privacy-requests');

  return (
    <div>
      <h1 className="text-2xl font-semibold">Privacy requests</h1>
      <p className="text-ody-muted mt-2">Handle data subject access and deletion requests.</p>
      <div className="mt-4">
        <PrivacyRequestsClient initialItems={data.items || []} />
      </div>
    </div>
  );
}
