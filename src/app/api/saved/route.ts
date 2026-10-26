import { json, readJson, withUser } from '@/lib/api';
import { sql } from '@/lib/db';

export const POST = withUser(async (user, request) => {
  const { articleId, saved } = await readJson<{ articleId: number; saved: boolean }>(request);
  const id = Number(articleId);
  if (!Number.isSafeInteger(id)) return json({ error: 'Bad article' }, 400);
  // Only articles that were in this reader's own editions can be saved.
  const [owned] = await sql`select 1 from app.user_articles where user_id = ${user.id} and article_id = ${id}`;
  if (!owned) return json({ error: 'Not found' }, 404);
  if (saved) await sql`insert into app.saved (user_id, article_id) values (${user.id}, ${id}) on conflict do nothing`;
  else await sql`delete from app.saved where user_id = ${user.id} and article_id = ${id}`;
  return json({ saved: !!saved });
});
