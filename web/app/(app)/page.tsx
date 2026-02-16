import { redirect } from 'next/navigation';
import { getSession } from '@/lib/server-auth';

export default async function AppRootPage() {
  const session = await getSession();
  if (!session) {
    redirect('/login');
  }
  if (session.user.role === 'TUTOR' || session.user.role === 'ADMIN') {
    redirect('/tutor/dashboard');
  }
  redirect('/dashboard');
}
