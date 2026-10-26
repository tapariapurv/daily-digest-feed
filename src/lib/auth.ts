import { redirect } from 'next/navigation';
import { cache } from 'react';
import { sql } from './db';
import { createSupabaseServer } from './supabase/server';

export type SessionUser = { id: string; email: string | null };

/** The verified signed-in user for this request, or null. Cached per request. */
export const getSessionUser = cache(async (): Promise<SessionUser | null> => {
  const supabase = await createSupabaseServer();
  const { data } = await supabase.auth.getClaims();
  const claims = data?.claims;
  if (!claims?.sub) return null;
  const user = { id: claims.sub, email: typeof claims.email === 'string' ? claims.email : null };
  // First visit after sign-up: create the profile row.
  await sql`
    insert into app.profiles (user_id, email) values (${user.id}, ${user.email})
    on conflict (user_id) do update set email = excluded.email where app.profiles.email is distinct from excluded.email`;
  return user;
});

export async function requireUser(): Promise<SessionUser> {
  const user = await getSessionUser();
  if (!user) redirect('/login');
  return user;
}
