import { NextResponse, type NextRequest } from 'next/server';
import { SESSION_COOKIE } from './lib/firebase/config';

// Pages anyone can open. Everything else needs a session cookie; pages and APIs verify it themselves.
const PUBLIC = [/^\/$/, /^\/login$/, /^\/signup$/, /^\/forgot$/, /^\/r\//, /^\/api\/session$/, /^\/api\/cron\//, /^\/api\/health$/];

export function proxy(request: NextRequest) {
  const signedIn = request.cookies.has(SESSION_COOKIE);
  const { pathname, search } = request.nextUrl;
  if (!signedIn && !PUBLIC.some((re) => re.test(pathname))) {
    if (pathname.startsWith('/api/')) return NextResponse.json({ error: 'Not signed in' }, { status: 401 });
    const login = new URL('/login', request.url);
    login.searchParams.set('next', pathname + search);
    return NextResponse.redirect(login);
  }
  return NextResponse.next();
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico|icon.svg|apple-icon.png|manifest.webmanifest|robots.txt).*)'],
};
