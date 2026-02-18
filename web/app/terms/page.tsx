import Link from 'next/link';
import type { Route } from 'next';

export const metadata = {
  title: 'Terms | Project Odysseus',
};

export default function TermsPage() {
  return (
    <main className="mx-auto max-w-4xl px-6 py-12">
      <article className="ody-card space-y-4">
        <h1 className="text-3xl font-bold">Terms</h1>
        <p className="text-sm text-ody-muted">
          These terms govern use of Project Odysseus learning services, tutor workflows, and platform features.
        </p>
        <p className="text-sm text-ody-muted">
          Access is role-based and governed by account permissions. Misuse of portal access or data handling controls may result in suspension.
        </p>
        <div>
          <Link href={'/' as Route} className="ody-btn-secondary">Back home</Link>
        </div>
      </article>
    </main>
  );
}
