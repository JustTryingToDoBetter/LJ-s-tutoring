import { NextRequest, NextResponse } from 'next/server';
import { API_BASE_URL } from '@/lib/env';

export async function POST(req: NextRequest) {
  const contentType = req.headers.get('content-type') || '';
  let payload: Record<string, unknown> = {};
  if (contentType.includes('application/json')) {
    payload = await req.json();
  } else if (contentType.includes('application/x-www-form-urlencoded') || contentType.includes('multipart/form-data')) {
    const formData = await req.formData();
    payload = {
      email: formData.get('email'),
      password: formData.get('password'),
    };
  }

  const upstream = await fetch(`${API_BASE_URL}/auth/login`, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
    },
    body: JSON.stringify(payload),
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
