import Link from 'next/link';
import { Card, CardTitle } from '@/components/ui/card';

const guides = [
  {
    slug: 'matric-maths-mistakes-guide',
    title: 'Matric Maths Mistakes Guide',
    description: 'Common Grade 12 maths pitfalls and practical correction patterns.',
  },
];

export default function GuidesIndexPage() {
  return (
    <main className="mx-auto grid max-w-5xl gap-4 px-6 py-12">
      <Card className="bg-gradient-to-br from-violet-500/15 to-sky-500/15">
        <CardTitle>Guides</CardTitle>
        <p className="mt-2 text-sm text-ody-muted">Learning resources migrated from legacy static pages into Next routes.</p>
      </Card>

      <div className="grid gap-4">
        {guides.map((guide) => (
          <Card key={guide.slug}>
            <CardTitle>{guide.title}</CardTitle>
            <p className="mt-2 text-sm text-ody-muted">{guide.description}</p>
            <Link href={`/guides/${guide.slug}`} className="ody-btn-secondary mt-3">Read guide</Link>
          </Card>
        ))}
      </div>
    </main>
  );
}
