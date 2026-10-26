import { after } from 'next/server';
import { json } from '@/lib/api';
import { sql } from '@/lib/db';
import { executeRun, prune, startRun } from '@/lib/pipeline';
import { normaliseSchedule } from '@/lib/profile';
import { nextRunAfter } from '@/lib/schedule';

export const maxDuration = 300;
export const dynamic = 'force-dynamic';

const BUDGET_MS = 250_000;

/**
 * Called every 10 minutes by Supabase pg_cron (and daily by Vercel Cron as a backstop).
 * Claims readers whose edition is due within 10 minutes, so papers are ready on time.
 */
async function tick(request: Request) {
  const secret = process.env.CRON_SECRET;
  if (!secret || request.headers.get('authorization') !== `Bearer ${secret}`) return json({ error: 'Unauthorized' }, 401);

  // Lease: push next_run_at an hour out so a crashed tick retries later instead of losing the slot.
  const claimed = await sql<{ user_id: string; schedule: object }[]>`
    with due as (
      select user_id from app.profiles
      where onboarded and next_run_at is not null and next_run_at <= now() + interval '10 minutes'
      order by next_run_at limit 12 for update skip locked
    )
    update app.profiles p set next_run_at = now() + interval '1 hour'
    from due where p.user_id = due.user_id
    returning p.user_id, p.schedule`;

  const started = Date.now();
  after(async () => {
    for (const { user_id, schedule } of claimed) {
      if (Date.now() - started > BUDGET_MS - 60_000) {
        // Out of time: hand the rest back to the next tick.
        await sql`update app.profiles set next_run_at = now() where user_id = ${user_id}`;
        continue;
      }
      const next = nextRunAfter(normaliseSchedule(schedule as never), new Date(Date.now() + 15 * 60_000));
      await sql`update app.profiles set next_run_at = ${next} where user_id = ${user_id}`;
      try {
        const { run, started: ok } = await startRun(user_id, 'schedule');
        if (ok) await executeRun(run.id, user_id, { deadline: started + BUDGET_MS });
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
