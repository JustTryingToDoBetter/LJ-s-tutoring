import nextDynamic from 'next/dynamic';
import { apiGet } from '@/lib/server-api';
import { requireSession } from '@/lib/server-auth';

const AssignmentsClient = nextDynamic(() => import('@/components/admin/AssignmentsClient'), { ssr: false });

export const dynamic = 'force-dynamic';

export default async function AssignmentsPage() {
  await requireSession(['ADMIN']);
  const data = await apiGet<{ assignments: any[] }>('/admin/assignments');

  return (
    <div>
      <h1 className="text-2xl font-semibold">Assignments</h1>
      <p className="text-ody-muted mt-2">Create and manage student assignments.</p>
      <div className="mt-4">
        <AssignmentsClient initialAssignments={data.assignments || []} />
      </div>
    </div>
  );
}
