import { Card, CardTitle } from '@/components/ui/card';
import { requireSession } from '@/lib/server-auth';

export const dynamic = 'force-dynamic';

export default async function AssistantPage() {
  await requireSession(['STUDENT', 'TUTOR', 'ADMIN']);
  return (
    <Card>
      <CardTitle>Assistant</CardTitle>
      <p className="mt-2 text-sm text-ody-muted">Phase 3 migration surface. This route is now in Next.js and ready to connect to assistant APIs.</p>
    </Card>
  );
}
