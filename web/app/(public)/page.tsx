import Link from 'next/link';

export default function HomePage() {
  return (
    <main className="mx-auto max-w-6xl px-6 py-16">
      <div className="ody-card space-y-6">
        <p className="ody-chip">Project Odysseus • Unified Next.js Migration</p>
        <h1 className="text-4xl font-bold">Academic OS for focused student growth</h1>
        <p className="max-w-3xl text-ody-muted">
          Premium dark analytics UI, tutor tooling, streak-driven engagement, and community learning powered by a secure Fastify API.
        </p>
        <div className="flex flex-wrap gap-3">
          <Link href="/login" className="ody-btn-primary">Sign in</Link>
          <Link href="/dashboard" className="ody-btn-secondary">Student dashboard</Link>
          <Link href="/tutor/dashboard" className="ody-btn-secondary">Tutor dashboard</Link>
          <Link href="/guides" className="ody-btn-secondary">Guides</Link>
          <Link href="/privacy" className="ody-btn-secondary">Privacy</Link>
        </div>
      </div>
    </main>
  );
}
