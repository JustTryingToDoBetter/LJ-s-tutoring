import type { ReactNode } from 'react';
import { AppShell, adminNav } from '@/components/app/app-shell';
import { requireSession } from '@/lib/server-auth';

export const dynamic = 'force-dynamic';

export default async function AdminLayout({ children }: { children: ReactNode }) {
  await requireSession(['ADMIN']);
  return <AppShell title="Admin Workspace" nav={adminNav}>{children}</AppShell>;
}
