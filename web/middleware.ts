import type { NextRequest } from 'next/server';
import { NextResponse } from 'next/server';

const AUTH_PATH_PREFIXES = [
  '/admin',
  '/dashboard',
  '/reports',
  '/assistant',
  '/vault',
  '/parent',
  '/community',
  '/tutor',
];

export function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;
  const isProtected = AUTH_PATH_PREFIXES.some((prefix) => pathname.startsWith(prefix));

  if (!isProtected) {
    return NextResponse.next();
  }

  const session = req.cookies.get('session')?.value;
  if (!session) {
    const loginUrl = new URL('/login', req.url);
    loginUrl.searchParams.set('next', pathname);
    return NextResponse.redirect(loginUrl);
  }

  const response = NextResponse.next();
  response.headers.set('Cache-Control', 'private, no-store, max-age=0');
  return response;
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico).*)'],
};
