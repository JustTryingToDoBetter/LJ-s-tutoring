import { AppShell, tutorNav } from '@/components/app/app-shell';
import { requireSession } from '@/lib/server-auth';
import type { ReactNode } from 'react';

export const dynamic = 'force-dynamic';

export default async function TutorLayout({ children }: { children: ReactNode }) {
  await requireSession(['TUTOR', 'ADMIN']);
  return <AppShell title="Tutor Workspace" nav={tutorNav}>{children}</AppShell>;
}
