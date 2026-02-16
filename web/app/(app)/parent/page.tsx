import { Card, CardTitle } from '@/components/ui/card';
import { requireSession } from '@/lib/server-auth';

export const dynamic = 'force-dynamic';

export default async function ParentPage() {
  await requireSession(['ADMIN', 'TUTOR', 'STUDENT']);
  return (
    <Card>
      <CardTitle>Parent Surface</CardTitle>
      <p className="mt-2 text-sm text-ody-muted">Parent surface scaffolded in Next.js for incremental migration. Connect to parent-specific APIs in follow-up PR.</p>
    </Card>
  );
}
