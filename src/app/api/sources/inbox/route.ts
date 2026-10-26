import { json, readJson, withUser } from '@/lib/api';
import { sql } from '@/lib/db';
import { createNewsletterInbox } from '@/lib/inbox';
import { listSources } from '@/lib/sources';

export const maxDuration = 30;

/** One click: a private email address whose newsletters flow into the paper. */
export const POST = withUser(async (user, request) => {
  const { title } = await readJson<{ title: string }>(request);
  const name = (typeof title === 'string' && title.trim()) || 'Newsletters';
  let inbox;
  try {
    inbox = await createNewsletterInbox(`${name} · Morning Digest`);
  } catch (err) {
    return json({ error: err instanceof Error ? err.message : String(err) }, 502);
  }
  await sql`
    insert into app.sources (user_id, input_url, feed_url, site_url, title, kind, inbox_email)
    values (${user.id}, ${inbox.feedUrl}, ${inbox.feedUrl}, ${null}, ${name.slice(0, 120)}, 'newsletter', ${inbox.email})`;
  return json({ inbox, sources: await listSources(user.id) });
});
