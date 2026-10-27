import { json, withUser } from '@/lib/api';
import { sql } from '@/lib/db';
import { mailboxConfigured, newInboxAddress } from '@/lib/mailbox';
import { listSources } from '@/lib/sources';

/** One click: a private email address whose newsletters flow into the paper. */
export const POST = withUser(async (user) => {
  if (!mailboxConfigured()) return json({ error: 'The newsletter inbox isn’t switched on for this site yet.' }, 503);
  const [existing] = await sql<{ inbox_email: string }[]>`
    select inbox_email from app.sources where user_id = ${user.id} and kind = 'inbox' limit 1`;
  if (existing) return json({ inbox: { email: existing.inbox_email }, sources: await listSources(user.id) });
  const { token, email } = newInboxAddress();
  await sql`
    insert into app.sources (user_id, input_url, feed_url, site_url, title, kind, inbox_email)
    values (${user.id}, ${email}, ${`inbox:${token}`}, ${null}, 'Newsletters', 'inbox', ${email})`;
  return json({ inbox: { email }, sources: await listSources(user.id) });
});
