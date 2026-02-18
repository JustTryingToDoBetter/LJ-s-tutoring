import nextDynamic from 'next/dynamic';
import { apiGet } from '@/lib/server-api';
import { requireSession } from '@/lib/server-auth';

const PayrollClient = nextDynamic(() => import('@/components/admin/PayrollClient'), { ssr: false });

export const dynamic = 'force-dynamic';

export default async function PayrollPage() {
  await requireSession(['ADMIN']);
  const data = await apiGet<{ items: any[] }>('/admin/payroll');

  return (
    <div>
      <h1 className="text-2xl font-semibold">Payroll</h1>
      <p className="text-ody-muted mt-2">Manage tutor payouts and payroll runs.</p>
      <div className="mt-4">
        <PayrollClient initialItems={data.items || []} />
      </div>
    </div>
  );
}
