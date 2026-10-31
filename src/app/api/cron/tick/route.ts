import { after } from 'next/server';
import { json } from '@/lib/api';
import { db, profiles } from '@/lib/db';
import { executeRun, prune, startRun } from '@/lib/pipeline';
import { normaliseSchedule } from '@/lib/profile';
import { nextRunAfter } from '@/lib/schedule';

export const maxDuration = 300;
export const dynamic = 'force-dynamic';

const BUDGET_MS = 250_000;
const MIN_GAP_MS = 4 * 60_000;

/**
 * Called every 10 minutes by a Google Apps Script trigger (and daily by Vercel Cron as a backstop).
 * No secret needed: it only prints editions that are already due, and ticks closer than 4 minutes apart are ignored.
 * Claims readers whose edition is due within 10 minutes, so papers are ready on time.
 */
async function tick() {
  const meta = db().collection('meta').doc('tick');
  const ok = await db().runTransaction(async (tx) => {
    const last = (await tx.get(meta)).get('at')?.toMillis?.() ?? 0;
    if (Date.now() - last < MIN_GAP_MS) return false;
    tx.set(meta, { at: new Date() });
    return true;
  });
  if (!ok) return json({ skipped: 'too soon' });

  // Lease: push next_run_at an hour out so a crashed tick retries later instead of losing the slot.
  const due = await profiles().where('next_run_at', '<=', new Date(Date.now() + 10 * 60_000)).orderBy('next_run_at').limit(12).get();
  const claimed: { user_id: string; schedule: object }[] = [];
  for (const d of due.docs) {
    if (!d.get('onboarded')) continue;
    await d.ref.update({ next_run_at: new Date(Date.now() + 3600_000) });
    claimed.push({ user_id: d.id, schedule: d.get('schedule') });
  }

  const started = Date.now();
  after(async () => {
    for (const { user_id, schedule } of claimed) {
      const ref = profiles().doc(user_id);
      if (Date.now() - started > BUDGET_MS - 60_000) {
        // Out of time: hand the rest back to the next tick.
        await ref.update({ next_run_at: new Date() });
        continue;
      }
      await ref.update({ next_run_at: nextRunAfter(normaliseSchedule(schedule as never), new Date(Date.now() + 15 * 60_000)) });
      try {
        const { run, started: ran } = await startRun(user_id, 'schedule');
        if (ran) await executeRun(run.id, user_id, { deadline: started + BUDGET_MS });
      } catch (err) {
        console.error('scheduled run failed', user_id, err);
      }
    }
    if (new Date().getUTCHours() === 3 && new Date().getUTCMinutes() < 10) await prune().catch((e) => console.error('prune', e));
  });
  return json({ claimed: claimed.length });
}

export const GET = tick;
export const POST = tick;
