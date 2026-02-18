import Link from 'next/link';
import { notFound } from 'next/navigation';

const GUIDE_CONTENT: Record<string, { title: string; intro: string; sections: Array<{ heading: string; body: string }> }> = {
  'matric-maths-mistakes-guide': {
    title: 'Matric Maths Mistakes Guide',
    intro: 'A concise guide to avoid frequent Grade 12 maths mistakes and improve exam consistency.',
    sections: [
      {
        heading: '1) Misreading the question',
        body: 'Underline command words and rewrite the ask before calculating. This reduces avoidable method errors.',
      },
      {
        heading: '2) Skipping algebra steps',
        body: 'Show transformations line-by-line. Markers often award method marks even when arithmetic slips occur.',
      },
      {
        heading: '3) No time strategy',
        body: 'Allocate time per mark and return to hard questions later. Bank easy marks first to stabilize performance.',
      },
      {
        heading: '4) Weak error review',
        body: 'Keep an error log by topic and trigger. Focus revision on recurring mistake patterns instead of random drilling.',
      },
    ],
  },
};

export function generateStaticParams() {
  return Object.keys(GUIDE_CONTENT).map((slug) => ({ slug }));
}

export default function GuidePage({ params }: { params: { slug: string } }) {
  const guide = GUIDE_CONTENT[params.slug];
  if (!guide) {
    notFound();
  }

  return (
    <main className="mx-auto max-w-4xl px-6 py-12">
      <article className="ody-card space-y-6">
        <header>
          <p className="ody-chip">Guide</p>
          <h1 className="mt-3 text-3xl font-bold">{guide.title}</h1>
          <p className="mt-2 text-sm text-ody-muted">{guide.intro}</p>
        </header>

        <div className="space-y-4">
          {guide.sections.map((section) => (
            <section key={section.heading} className="rounded-xl border border-ody-border/70 bg-slate-900/40 p-4">
              <h2 className="text-lg font-semibold">{section.heading}</h2>
              <p className="mt-2 text-sm text-ody-muted">{section.body}</p>
            </section>
          ))}
        </div>

        <div>
          <Link href="/guides" className="ody-btn-secondary">Back to guides</Link>
        </div>
      </article>
    </main>
  );
}
