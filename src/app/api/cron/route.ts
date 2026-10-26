import { json } from '@/lib/api';
import { executeRun, prune, startRun } from '@/lib/pipeline';

export const maxDuration = 300;
export const dynamic = 'force-dynamic';

// Called daily by Vercel Cron (see vercel.json), which sends `Authorization: Bearer $CRON_SECRET`.
export async function GET(request: Request) {
  const secret = process.env.CRON_SECRET;
  if (!secret || request.headers.get('authorization') !== `Bearer ${secret}`) {
    return json({ error: 'Unauthorized' }, 401);
  }
  const { run, started } = await startRun('cron');
  if (!started) return json({ skipped: 'A run is already in progress', run });
  await executeRun(run.id);
  await prune().catch((err) => console.error('prune failed', err));
  return json({ ok: true, runId: run.id });
}
