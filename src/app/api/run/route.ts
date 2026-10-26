import { after } from 'next/server';
import { denyUnlessAuthed, json } from '@/lib/api';
import { sql, type Run } from '@/lib/db';
import { executeRun, startRun } from '@/lib/pipeline';

export const maxDuration = 300;

/** Kick off a run in the background and return its id; the client polls GET /api/run/[id]. */
export async function POST() {
  const denied = await denyUnlessAuthed();
  if (denied) return denied;
  const { run, started } = await startRun('manual');
  if (started) after(() => executeRun(run.id));
  return json({ run });
}

export async function GET() {
  const denied = await denyUnlessAuthed();
  if (denied) return denied;
  const [run] = await sql<Run[]>`select * from runs order by started_at desc limit 1`;
  return json({ run: run ?? null });
}
