import Link from 'next/link';
import type { Route } from 'next';

export const metadata = {
  title: 'Privacy | Project Odysseus',
};

export default function PrivacyPage() {
  return (
    <main className="mx-auto max-w-4xl px-6 py-12">
      <article className="ody-card space-y-4">
        <h1 className="text-3xl font-bold">Privacy</h1>
        <p className="text-sm text-ody-muted">
          Project Odysseus processes learner and tutor data for tutoring operations, progress analytics, and safety workflows.
          Analytics and telemetry are consent-gated and must avoid personally identifiable payloads.
        </p>
        <p className="text-sm text-ody-muted">
          For privacy access or deletion requests, contact the support channel listed in your account communications.
        </p>
        <div>
          <Link href={'/' as Route} className="ody-btn-secondary">Back home</Link>
        </div>
      </article>
    </main>
  );
}
