import { cookies } from 'next/headers';
import { API_BASE_URL } from '@/lib/env';

export async function apiGet<T>(path: string): Promise<T> {
  const cookieHeader = cookies()
    .getAll()
    .map((entry) => `${entry.name}=${entry.value}`)
    .join('; ');

  const response = await fetch(`${API_BASE_URL}${path}`, {
    method: 'GET',
    headers: {
      cookie: cookieHeader,
      accept: 'application/json',
    },
    cache: 'no-store',
  });

  if (!response.ok) {
    throw new Error(`api_get_failed:${response.status}`);
  }

  return response.json() as Promise<T>;
}

export async function apiPost<T>(path: string, body: Record<string, unknown>) {
  const cookieStore = cookies();
  const cookieHeader = cookieStore
    .getAll()
    .map((entry) => `${entry.name}=${entry.value}`)
    .join('; ');
  const csrf = cookieStore.get('csrf')?.value;

  const response = await fetch(`${API_BASE_URL}${path}`, {
    method: 'POST',
    headers: {
      cookie: cookieHeader,
      'content-type': 'application/json',
      ...(csrf ? { 'x-csrf-token': csrf } : {}),
    },
    body: JSON.stringify(body),
    cache: 'no-store',
  });

  if (!response.ok) {
    throw new Error(`api_post_failed:${response.status}`);
  }

  return response.json() as Promise<T>;
}
