import { NextResponse } from 'next/server';
import { profiles } from '@/lib/db';
import { fromMailAccount, mailIn, mailMeta, mailOut } from '@/lib/mailbox';

export const maxDuration = 30;

/**
 * Apps Script mail bridge, called every 10 minutes by scheduler/Code.js.
 *   {}            → { inboxes, outbox, next }  addresses to collect from, editions to send,
 *                   and when the earliest edition is due, so the script only wakes the app then
 *   { issue }     → stores one newsletter issue
 *   { sent: id }  → removes a sent email from the outbox
 */
export async function POST(req: Request) {
  if (!(await fromMailAccount(req))) return NextResponse.json({ error: 'Not the mail account' }, { status: 403 });
  const body = (await req.json().catch(() => ({}))) as { issue?: Record<string, string>; sent?: string };

  if (body.issue) {
    const i = body.issue;
    if (!i.id || !i.to) return NextResponse.json({ error: 'Bad issue' }, { status: 400 });
    await mailIn().doc(i.id).set({
      id: i.id, to: i.to.toLowerCase(), from: i.from ?? '', subject: i.subject ?? '', date: new Date(i.date || Date.now()),
      html: (i.html ?? '').slice(0, 400_000), text: (i.text ?? '').slice(0, 100_000), received_at: new Date(),
    });
    return NextResponse.json({ ok: true });
  }
  if (body.sent) {
    await mailOut().doc(body.sent).delete();
    return NextResponse.json({ ok: true });
  }
  const [meta, outbox, soonest] = await Promise.all([
    mailMeta().get(),
    mailOut().orderBy('created_at').limit(20).get(),
    // ponytail: assumes one of the 20 earliest schedules is an onboarded reader; widen if many sign-ups never finish
    profiles().where('next_run_at', '>', new Date(0)).orderBy('next_run_at').limit(20).select('onboarded', 'next_run_at').get(),
  ]);
  return NextResponse.json({
    inboxes: (meta.get('inboxes') as string[] | undefined) ?? [],
    outbox: outbox.docs.map((d) => ({ id: d.id, to: d.get('to'), subject: d.get('subject'), html: d.get('html'), text: d.get('text'), name: d.get('name') })),
    next: soonest.docs.find((d) => d.get('onboarded'))?.get('next_run_at')?.toMillis() ?? null,
  });
}
