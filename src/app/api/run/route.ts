import { after } from 'next/server';
import { json, withUser } from '@/lib/api';
import { rows, type Run } from '@/lib/db';
import { executeRun, RunLimitError, runsOf, startRun } from '@/lib/pipeline';

export const maxDuration = 300;

/** Kick off a run in the background and return its id; the client polls GET /api/run/[id]. */
export const POST = withUser(async (user) => {
  try {
    const { run, started } = await startRun(user.id, 'manual');
    if (started) after(() => executeRun(run.id, user.id));
    return json({ run });
  } catch (err) {
    if (err instanceof RunLimitError) return json({ error: err.message }, 429);
    throw err;
  }
});

export const GET = withUser(async (user) => {
  const [run] = rows<Run>(await runsOf(user.id).orderBy('started_at', 'desc').limit(1).get());
  return json({ run: run ?? null });
});
