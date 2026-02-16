import { Card, CardTitle } from '@/components/ui/card';
import { requireSession } from '@/lib/server-auth';

export const dynamic = 'force-dynamic';

export default async function VaultPage() {
  await requireSession(['STUDENT', 'TUTOR', 'ADMIN']);
  return (
    <Card>
      <CardTitle>Vault</CardTitle>
      <p className="mt-2 text-sm text-ody-muted">Tier-gated vault route placeholder in Next.js migration. Gate logic can be wired to existing subscription flags.</p>
    </Card>
  );
}
