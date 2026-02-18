import nextDynamic from 'next/dynamic';
import { apiGet } from '@/lib/server-api';
import { requireSession } from '@/lib/server-auth';

const TutorsClient = nextDynamic(() => import('@/components/admin/TutorsClient'), { ssr: false });

export const dynamic = 'force-dynamic';

type Tutor = {
  id: string;
  full_name?: string;
  email?: string;
  active?: boolean;
  default_hourly_rate?: number | string;
  status?: string;
  qualified_subjects_json?: string | string[];
};

export default async function TutorsPage() {
  await requireSession(['ADMIN']);
  const data = await apiGet<{ tutors: Tutor[] }>('/admin/tutors');

  return (
    <div>
      <h1 className="text-2xl font-semibold">Tutors</h1>
      <p className="text-ody-muted mt-2">Manage tutors: create, search and impersonate.</p>
      <div className="mt-4">
        {/* client component handles interactivity */}
        <TutorsClient initialTutors={data.tutors || []} />
      </div>
    </div>
  );
}
