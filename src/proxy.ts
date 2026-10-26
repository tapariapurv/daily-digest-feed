import { NextResponse, type NextRequest } from 'next/server';
import { SESSION_COOKIE, verifySessionToken } from './lib/session.ts';

const PUBLIC_PATHS = ['/login', '/api/auth/login', '/api/cron', '/api/health'];

// Cheap signature check on every request. Route handlers that change data also
// re-check the passcode version against the database (see lib/auth.ts).
export async function proxy(request: NextRequest) {
  const { pathname, search } = request.nextUrl;
  if (PUBLIC_PATHS.some((p) => pathname === p || pathname.startsWith(`${p}/`))) return NextResponse.next();

  const valid = await verifySessionToken(request.cookies.get(SESSION_COOKIE)?.value).catch(() => null);
  if (valid) return NextResponse.next();

  if (pathname.startsWith('/api/')) return NextResponse.json({ error: 'Not signed in' }, { status: 401 });
  const login = new URL('/login', request.url);
  if (pathname !== '/') login.searchParams.set('next', pathname + search);
  return NextResponse.redirect(login);
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico|icon.svg|manifest.webmanifest|robots.txt).*)'],
};
