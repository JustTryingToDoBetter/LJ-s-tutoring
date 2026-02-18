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

const SUBDOMAIN_ROUTE_PREFIX: Record<string, string> = {
  admin: '/admin',
  tutor: '/tutor',
  student: '/dashboard',
};

function resolveSubdomainPrefix(hostHeader: string | null): string | null {
  if (!hostHeader) {
    return null;
  }

  const host = hostHeader.split(':')[0].toLowerCase();
  const [subdomain] = host.split('.');
  return SUBDOMAIN_ROUTE_PREFIX[subdomain] ?? null;
}

function isRewritablePath(pathname: string): boolean {
  if (pathname.startsWith('/_next')) {
    return false;
  }

  return !(
    pathname.startsWith('/api') ||
    pathname === '/favicon.ico' ||
    pathname === '/robots.txt' ||
    pathname === '/sitemap.xml' ||
    pathname === '/sw.js' ||
    pathname === '/ads.txt'
  );
}

export function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;
  const subdomainPrefix = resolveSubdomainPrefix(req.headers.get('host'));
  const shouldRewrite = Boolean(subdomainPrefix && isRewritablePath(pathname) && !pathname.startsWith(subdomainPrefix));

  const effectivePathname = shouldRewrite
    ? pathname === '/'
      ? subdomainPrefix!
      : `${subdomainPrefix}${pathname}`
    : pathname;

  const isProtected = AUTH_PATH_PREFIXES.some((prefix) => effectivePathname.startsWith(prefix));

  if (!isProtected) {
    if (!shouldRewrite) {
      return NextResponse.next();
    }

    return NextResponse.rewrite(new URL(effectivePathname, req.url));
  }

  const session = req.cookies.get('session')?.value;
  if (!session) {
    const loginUrl = new URL('/login', req.url);
    loginUrl.searchParams.set('next', effectivePathname);
    return NextResponse.redirect(loginUrl);
  }

  const response = shouldRewrite
    ? NextResponse.rewrite(new URL(effectivePathname, req.url))
    : NextResponse.next();
  response.headers.set('Cache-Control', 'private, no-store, max-age=0');
  return response;
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico).*)'],
};
