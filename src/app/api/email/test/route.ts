import { json, withUser } from '@/lib/api';
import { sql } from '@/lib/db';
import { mailConfigured, sendEditionEmail } from '@/lib/mailer';

export const maxDuration = 30;

export const POST = withUser(async (user) => {
  if (!mailConfigured()) return json({ error: 'Email sending isn’t set up on this server yet.' }, 503);
  const [edition] = await sql<{ id: number }[]>`select id from app.editions where user_id = ${user.id} order by id desc limit 1`;
  if (!edition) return json({ error: 'You don’t have an edition yet — refresh first.' }, 400);
  await sendEditionEmail(user.id, edition.id);
  return json({ ok: true, to: user.email });
});
