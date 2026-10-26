import { denyUnlessAuthed, json } from '@/lib/api';
import { sql, type Run } from '@/lib/db';

export async function GET(_request: Request, ctx: RouteContext<'/api/run/[id]'>) {
  const denied = await denyUnlessAuthed();
  if (denied) return denied;
  const { id } = await ctx.params;
  const [run] = await sql<Run[]>`select * from runs where id = ${Number(id) || 0}`;
  return run ? json({ run }) : json({ error: 'Not found' }, 404);
}
