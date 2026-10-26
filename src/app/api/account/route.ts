import { json, withUser } from '@/lib/api';
import { sql } from '@/lib/db';
import { createSupabaseServer } from '@/lib/supabase/server';

/** Delete everything this reader stored (sources, editions, history). */
export const DELETE = withUser(async (user) => {
  await sql`delete from app.profiles where user_id = ${user.id}`;
  await (await createSupabaseServer()).auth.signOut();
  return json({ ok: true });
});
