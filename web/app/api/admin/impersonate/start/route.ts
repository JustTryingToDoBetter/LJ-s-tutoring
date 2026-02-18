import { NextResponse } from 'next/server';
import { API_BASE_URL } from '@/lib/env';

export async function POST(request: Request) {
  const url = `${API_BASE_URL}/admin/impersonate/start`;
  const headers = new Headers();
  headers.set('content-type', 'application/json');
  const cookie = request.headers.get('cookie');
  if (cookie) headers.set('cookie', cookie);
  const csrf = request.headers.get('x-csrf-token');
  if (csrf) headers.set('x-csrf-token', csrf);
  const body = await request.text();
  const res = await fetch(url, { method: 'POST', headers, body });
  const text = await res.text();
  // forward set-cookie headers
  const response = new NextResponse(text, { status: res.status, headers: { 'content-type': res.headers.get('content-type') || 'application/json' } });
  res.headers.forEach((value, key) => {
    if (key.toLowerCase() === 'set-cookie') {
      response.headers.set('set-cookie', value);
    }
  });
  return response;
}
