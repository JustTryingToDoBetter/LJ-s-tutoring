import Link from 'next/link';
import { notFound } from 'next/navigation';
import { Card, CardTitle } from '@/components/ui/card';

const SECTION_META: Record<string, { title: string; description: string }> = {
  tutors: {
    title: 'Tutors',
    description: 'Tutor management workflows and controls.',
  },
  students: {
    title: 'Students',
    description: 'Student roster and intervention workflows.',
  },
  assignments: {
    title: 'Assignments',
    description: 'Assign tutors to students and monitor overlap.',
  },
  approvals: {
    title: 'Approvals',
    description: 'Session approvals and queue management.',
  },
  payroll: {
    title: 'Payroll',
    description: 'Pay period summaries and payout operations.',
  },
  reconciliation: {
    title: 'Reconciliation',
    description: 'Verify generated payroll totals and exceptions.',
  },
  retention: {
    title: 'Retention',
    description: 'Data lifecycle controls and deletion workflows.',
  },
  audit: {
    title: 'Audit',
    description: 'Audit log review and compliance visibility.',
  },
  'privacy-requests': {
    title: 'Privacy Requests',
    description: 'Handle data access and deletion requests safely.',
  },
  'ops-runbook': {
    title: 'Ops Runbook',
    description: 'Runbook guidance for incident and operational flows.',
  },
};

export default function AdminSectionPage({ params }: { params: { section: string } }) {
  const meta = SECTION_META[params.section];
  if (!meta) {
    notFound();
  }

  return (
    <Card>
      <CardTitle>{meta.title}</CardTitle>
      <p className="mt-2 text-sm text-ody-muted">{meta.description}</p>
      <p className="mt-3 text-sm text-ody-muted">
        This legacy section now resolves through Next route parity. Continue migrating domain-specific UI logic into typed React modules in this route.
      </p>
      <div className="mt-4 flex gap-2">
        <Link href="/admin" className="ody-btn-secondary">Back to admin overview</Link>
      </div>
    </Card>
  );
}
