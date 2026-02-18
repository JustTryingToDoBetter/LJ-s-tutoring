import Link from 'next/link';
import type { Route } from 'next';
import { Card, CardTitle } from '@/components/ui/card';
import { apiGet } from '@/lib/server-api';

export const dynamic = 'force-dynamic';

type AdminDashboardPayload = {
  tutors: number;
  students: number;
  sessions: Array<{ count: number | string }>;
};

export default async function AdminPage() {
  const data = await apiGet<AdminDashboardPayload>('/admin/dashboard');
  const totalSessions = data.sessions.reduce((acc, row) => acc + Number(row.count || 0), 0);

  return (
    <>
      <Card className="bg-gradient-to-br from-violet-500/15 to-sky-500/15">
        <CardTitle>Admin dashboard</CardTitle>
        <p className="mt-2 text-sm text-ody-muted">Operational command center with role-based controls.</p>
        <div className="mt-3 flex flex-wrap gap-2">
          <span className="ody-chip">Tutors: {data.tutors}</span>
          <span className="ody-chip">Students: {data.students}</span>
          <span className="ody-chip">Sessions: {totalSessions}</span>
        </div>
      </Card>

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        {[
          ['Tutors', '/admin/tutors'],
          ['Students', '/admin/students'],
          ['Assignments', '/admin/assignments'],
          ['Approvals', '/admin/approvals'],
          ['Payroll', '/admin/payroll'],
          ['Reconciliation', '/admin/reconciliation'],
          ['Retention', '/admin/retention'],
          ['Audit', '/admin/audit'],
          ['Privacy Requests', '/admin/privacy-requests'],
        ].map(([label, href]) => (
          <Card key={href}>
            <CardTitle>{label}</CardTitle>
            <p className="mt-2 text-sm text-ody-muted">Migrated to Next route parity surface.</p>
            <Link href={href as Route} className="ody-btn-secondary mt-3">Open</Link>
          </Card>
        ))}
      </div>
    </>
  );
}
