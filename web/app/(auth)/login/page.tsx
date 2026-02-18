import { redirect } from 'next/navigation';
import { getSession } from '@/lib/server-auth';
import { LoginForm } from '@/components/app/login-form';

export default async function LoginPage() {
  const session = await getSession();
  if (session?.user?.role === 'TUTOR') {
    redirect('/tutor/dashboard');
  }
  if (session?.user?.role === 'STUDENT') {
    redirect('/dashboard');
  }
  if (session?.user?.role === 'ADMIN') {
    redirect('/admin');
  }

  return (
    <main className="mx-auto max-w-md px-6 py-16">
      <LoginForm />
    </main>
  );
}
