import { json, withUser } from '@/lib/api';
import { editionsOf } from '@/lib/editions';
import { mailConfigured, sendEditionEmail } from '@/lib/mailer';

export const maxDuration = 30;

export const POST = withUser(async (user) => {
  if (!mailConfigured()) return json({ error: 'Email sending isn’t set up on this server yet.' }, 503);
  const edition = (await editionsOf(user.id).orderBy('id', 'desc').limit(1).get()).docs[0]?.data() as { id: number } | undefined;
  if (!edition) return json({ error: 'You don’t have an edition yet — refresh first.' }, 400);
  await sendEditionEmail(user.id, edition.id);
  return json({ ok: true, to: user.email });
});
