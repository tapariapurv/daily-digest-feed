import { json, withUser } from '@/lib/api';
import { FieldValue } from '@/lib/db';
import { mailboxConfigured, mailMeta, newInboxAddress } from '@/lib/mailbox';
import { addSource, listSources, sourcesOf } from '@/lib/sources';

/** One click: a private email address whose newsletters flow into the paper. */
export const POST = withUser(async (user) => {
  if (!mailboxConfigured()) return json({ error: 'The newsletter inbox isn’t switched on for this site yet.' }, 503);
  const existing = (await sourcesOf(user.id).where('kind', '==', 'inbox').limit(1).get()).docs[0];
  if (existing) return json({ inbox: { email: existing.get('inbox_email') }, sources: await listSources(user.id) });
  const { token, email } = newInboxAddress();
  await addSource(user.id, { input_url: email, feed_url: `inbox:${token}`, site_url: null, title: 'Newsletters', kind: 'inbox', inbox_email: email });
  await mailMeta().set({ inboxes: FieldValue.arrayUnion(email.toLowerCase()) }, { merge: true });
  return json({ inbox: { email }, sources: await listSources(user.id) });
});
