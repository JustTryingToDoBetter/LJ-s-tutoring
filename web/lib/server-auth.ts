import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import { cache } from 'react';
import { API_BASE_URL } from '@/lib/env';
import type { SessionPayload, UserRole } from '@/lib/types';

export const getSession = cache(async (): Promise<SessionPayload | null> => {
  const cookieStore = cookies();
  const cookieHeader = cookieStore
    .getAll()
    .map((entry) => `${entry.name}=${entry.value}`)
    .join('; ');

  if (!cookieHeader.includes('session=')) {
    return null;
  }

  const response = await fetch(`${API_BASE_URL}/auth/session`, {
    method: 'GET',
    headers: {
      cookie: cookieHeader,
    },
    cache: 'no-store',
  });

  if (!response.ok) {
    return null;
  }

  return (await response.json()) as SessionPayload;
});

export async function requireSession(allowedRoles?: UserRole[]) {
  const session = await getSession();
  if (!session) {
    redirect('/login');
  }
  if (allowedRoles && !allowedRoles.includes(session.user.role)) {
    if (session.user.role === 'TUTOR') {
      redirect('/tutor/dashboard');
    }
    if (session.user.role === 'STUDENT') {
      redirect('/dashboard');
    }
    redirect('/login');
  }
  return session;
}
