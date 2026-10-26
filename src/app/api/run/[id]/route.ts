import { json, withUser } from '@/lib/api';
import { sql, type Run } from '@/lib/db';

type Ctx = { params: Promise<{ id: string }> };

export const GET = withUser<Ctx>(async (user, _request, ctx) => {
  const { id } = await ctx.params;
  const [run] = await sql<Run[]>`select * from app.runs where id = ${Number(id) || 0} and user_id = ${user.id}`;
  return run ? json({ run }) : json({ error: 'Not found' }, 404);
});
