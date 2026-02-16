import { AppShell, studentNav } from '@/components/app/app-shell';
import { requireSession } from '@/lib/server-auth';
import type { ReactNode } from 'react';

export const dynamic = 'force-dynamic';

export default async function ProtectedLayout({ children }: { children: ReactNode }) {
  await requireSession();
  return <AppShell title="Student Workspace" nav={studentNav}>{children}</AppShell>;
}
