import { NextResponse } from 'next/server';
import { API_BASE_URL } from '@/lib/env';

export async function GET(request: Request) {
  const url = `${API_BASE_URL}/admin/tutors`;
  const headers = new Headers();
  // forward cookies and x-request-id if present
  const cookie = request.headers.get('cookie');
  if (cookie) headers.set('cookie', cookie);
  const id = request.headers.get('x-request-id');
  if (id) headers.set('x-request-id', id);

  const res = await fetch(url, { headers });
  const text = await res.text();
  return new NextResponse(text, { status: res.status, headers: { 'content-type': res.headers.get('content-type') || 'application/json' } });
}

export async function POST(request: Request) {
  const url = `${API_BASE_URL}/admin/tutors`;
  const headers = new Headers();
  headers.set('content-type', 'application/json');
  const cookie = request.headers.get('cookie');
  if (cookie) headers.set('cookie', cookie);
  const csrf = request.headers.get('x-csrf-token');
  if (csrf) headers.set('x-csrf-token', csrf);
  const body = await request.text();
  const res = await fetch(url, { method: 'POST', headers, body });
  const text = await res.text();
  return new NextResponse(text, { status: res.status, headers: { 'content-type': res.headers.get('content-type') || 'application/json' } });
}
