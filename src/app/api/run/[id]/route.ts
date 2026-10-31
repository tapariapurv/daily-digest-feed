import { json, withUser } from '@/lib/api';
import { data, type Run } from '@/lib/db';
import { runsOf } from '@/lib/pipeline';

type Ctx = { params: Promise<{ id: string }> };

export const GET = withUser<Ctx>(async (user, _request, ctx) => {
  const { id } = await ctx.params;
  const snap = await runsOf(user.id).doc(String(Number(id) || 0)).get();
  return snap.exists ? json({ run: data<Run>(snap) }) : json({ error: 'Not found' }, 404);
});
