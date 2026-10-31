import { NextResponse } from 'next/server';
import { mailAccount, mailIn, mailMeta, mailOut } from '@/lib/mailbox';

export const maxDuration = 30;

/** Who is calling: the Google account behind the Apps Script's OAuth token. */
async function caller(req: Request): Promise<string | null> {
  const token = req.headers.get('authorization')?.replace(/^Bearer\s+/i, '');
  if (!token) return null;
  const res = await fetch('https://oauth2.googleapis.com/tokeninfo', { method: 'POST', body: new URLSearchParams({ access_token: token }) });
  if (!res.ok) return null;
  const info = (await res.json()) as { email?: string; email_verified?: string | boolean };
  return String(info.email_verified) === 'true' ? info.email?.toLowerCase() ?? null : null;
}

/**
 * Apps Script mail bridge, called every 10 minutes by scheduler/Code.js.
 *   {}            → { inboxes, outbox }  addresses to collect from, editions to send
 *   { issue }     → stores one newsletter issue
 *   { sent: id }  → removes a sent email from the outbox
 */
export async function POST(req: Request) {
  const account = mailAccount();
  if (!account || (await caller(req)) !== account) return NextResponse.json({ error: 'Not the mail account' }, { status: 403 });
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
  const [meta, outbox] = await Promise.all([mailMeta().get(), mailOut().orderBy('created_at').limit(20).get()]);
  return NextResponse.json({
    inboxes: (meta.get('inboxes') as string[] | undefined) ?? [],
    outbox: outbox.docs.map((d) => ({ id: d.id, to: d.get('to'), subject: d.get('subject'), html: d.get('html'), text: d.get('text'), name: d.get('name') })),
  });
}
