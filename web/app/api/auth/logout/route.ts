import { NextRequest, NextResponse } from 'next/server';
import { API_BASE_URL } from '@/lib/env';

export async function POST(req: NextRequest) {
  const cookieHeader = req.headers.get('cookie') || '';
  const csrfToken = req.headers.get('x-csrf-token') || '';

  const upstream = await fetch(`${API_BASE_URL}/auth/logout`, {
    method: 'POST',
    headers: {
      cookie: cookieHeader,
      ...(csrfToken ? { 'x-csrf-token': csrfToken } : {}),
    },
    cache: 'no-store',
  });

  const body = await upstream.text();
  const response = new NextResponse(body, {
    status: upstream.status,
    headers: {
      'content-type': upstream.headers.get('content-type') || 'application/json',
      'cache-control': 'private, no-store, max-age=0',
    },
  });

  const setCookie = upstream.headers.get('set-cookie');
  if (setCookie) {
    response.headers.set('set-cookie', setCookie);
  }

  return response;
}
