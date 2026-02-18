import nextDynamic from 'next/dynamic';
import { apiGet } from '@/lib/server-api';
import { requireSession } from '@/lib/server-auth';

const StudentsClient = nextDynamic(() => import('@/components/admin/StudentsClient'), { ssr: false });

export const dynamic = 'force-dynamic';

type Student = {
  id: string;
  full_name?: string;
  guardian_name?: string;
  grade?: string;
  active?: boolean;
};

export default async function StudentsPage() {
  await requireSession(['ADMIN']);
  const data = await apiGet<{ students: Student[] }>('/admin/students');

  return (
    <div>
      <h1 className="text-2xl font-semibold">Students</h1>
      <p className="text-ody-muted mt-2">Manage student records and guardians.</p>
      <div className="mt-4">
        <StudentsClient initialStudents={data.students || []} />
      </div>
    </div>
  );
}
