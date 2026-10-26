import { createServerClient } from '@supabase/ssr';
import { NextResponse, type NextRequest } from 'next/server';
import { SUPABASE_KEY, SUPABASE_URL } from './lib/supabase/config';

// Pages anyone can open. Everything else needs a signed-in user.
const PUBLIC = [/^\/$/, /^\/login$/, /^\/signup$/, /^\/forgot$/, /^\/auth\//, /^\/r\//, /^\/api\/cron\//, /^\/api\/health$/];

export async function proxy(request: NextRequest) {
  let response = NextResponse.next({ request });
  const supabase = createServerClient(SUPABASE_URL, SUPABASE_KEY, {
    cookies: {
      getAll: () => request.cookies.getAll(),
      setAll: (toSet) => {
        toSet.forEach(({ name, value }) => request.cookies.set(name, value));
        response = NextResponse.next({ request });
        toSet.forEach(({ name, value, options }) => response.cookies.set(name, value, options));
      },
    },
  });

  // Refreshes the session cookie when needed and verifies the JWT.
  const { data } = await supabase.auth.getClaims();
  const signedIn = !!data?.claims?.sub;
  const { pathname, search } = request.nextUrl;

  if (!signedIn && !PUBLIC.some((re) => re.test(pathname))) {
    if (pathname.startsWith('/api/')) return NextResponse.json({ error: 'Not signed in' }, { status: 401 });
    const login = new URL('/login', request.url);
    login.searchParams.set('next', pathname + search);
    return NextResponse.redirect(login);
  }
  if (signedIn && (pathname === '/login' || pathname === '/signup')) {
    return NextResponse.redirect(new URL('/', request.url));
  }
  return response;
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico|icon.svg|apple-icon.png|manifest.webmanifest|robots.txt).*)'],
};
