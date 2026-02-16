import { NextRequest, NextResponse } from 'next/server';
import { API_BASE_URL } from '@/lib/env';

export async function GET(req: NextRequest) {
  const cookieHeader = req.headers.get('cookie') || '';

  const upstream = await fetch(`${API_BASE_URL}/auth/session`, {
    method: 'GET',
    headers: {
      cookie: cookieHeader,
      accept: 'application/json',
    },
    cache: 'no-store',
  });

  const body = await upstream.text();
  return new NextResponse(body, {
    status: upstream.status,
    headers: {
      'content-type': upstream.headers.get('content-type') || 'application/json',
      'cache-control': 'private, no-store, max-age=0',
    },
  });
}
