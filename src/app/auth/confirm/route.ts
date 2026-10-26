import type { EmailOtpType } from '@supabase/supabase-js';
import { NextResponse, type NextRequest } from 'next/server';
import { createSupabaseServer } from '@/lib/supabase/server';

/** Landing point for links in Supabase emails (confirm sign-up, reset password). */
export async function GET(request: NextRequest) {
  const url = request.nextUrl;
  const next = url.searchParams.get('next');
  const safeNext = next && next.startsWith('/') && !next.startsWith('//') ? next : '/';
  const supabase = await createSupabaseServer();

  const tokenHash = url.searchParams.get('token_hash');
  const type = url.searchParams.get('type') as EmailOtpType | null;
  const code = url.searchParams.get('code');
  const { error } = tokenHash && type
    ? await supabase.auth.verifyOtp({ token_hash: tokenHash, type })
    : code
      ? await supabase.auth.exchangeCodeForSession(code)
      : { error: new Error('Missing token') };

  if (error) return NextResponse.redirect(new URL('/login?error=link', request.url));
  return NextResponse.redirect(new URL(safeNext, request.url));
}
