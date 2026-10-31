import { json, readJson, withUser } from '@/lib/api';
import { user as userDoc } from '@/lib/db';
import { ledgerOf } from '@/lib/sources';

export const POST = withUser(async (user, request) => {
  const { articleId, saved } = await readJson<{ articleId: number; saved: boolean }>(request);
  const id = Number(articleId);
  if (!Number.isSafeInteger(id)) return json({ error: 'Bad article' }, 400);
  // Only articles that were in this reader's own editions can be saved.
  if (!(await ledgerOf(user.id).doc(String(id)).get()).exists) return json({ error: 'Not found' }, 404);
  const ref = userDoc(user.id).collection('saved').doc(String(id));
  if (saved) await ref.set({ article_id: id, saved_at: new Date() });
  else await ref.delete();
  return json({ saved: !!saved });
});
