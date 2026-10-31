// Newsletter inbox on the app's own Gmail account: each reader gets a private
// plus-address (digest+token@gmail.com). The Apps Script scheduler (scheduler/Code.js),
// running as that Gmail account, posts each issue to /api/mail; they wait in `mail_in`.
import { randomBytes } from 'node:crypto';
import { db, data } from './db.ts';
import { firstImage, type ParsedItem } from './feeds';
import { htmlToText } from './text';

/** The Gmail account the Apps Script runs as; it receives newsletters and sends editions. */
export const mailAccount = (): string | null => process.env.MAIL_ACCOUNT?.trim().toLowerCase() || null;

export function mailboxConfigured(): boolean {
  return /@/.test(mailAccount() ?? '');
}

export const mailIn = () => db().collection('mail_in');
export const mailOut = () => db().collection('mail_out');
export const mailMeta = () => db().collection('meta').doc('mail');

export function newInboxAddress(): { token: string; email: string } {
  const [local, domain] = mailAccount()!.split('@');
  const alphabet = 'abcdefghjkmnpqrstuvwxyz23456789';
  const token = Array.from(randomBytes(10), (b) => alphabet[b % alphabet.length]).join('');
  return { token, email: `${local}+${token}@${domain}` };
}

export type InboxItem = ParsedItem & { html: string | null };
export type MailIssue = { id: string; to: string; from: string; subject: string; date: Date; html: string; text: string };

const VIEW_ONLINE = /view (it |this )?(email |newsletter )?(in|on) (your |a )?(web )?browser|read (it )?online|view online|web version|open in browser|read on (the )?web/i;

function viewOnlineLink(html: string): string | null {
  for (const m of html.matchAll(/<a\b[^>]*href=["'](https?:\/\/[^"']+)["'][^>]*>([\s\S]*?)<\/a>/gi)) {
    if (VIEW_ONLINE.test(htmlToText(m[2]))) return m[1].replace(/&amp;/g, '&');
  }
  return null;
}

/** Newest issues sent to one reader's address since `since`. */
export async function fetchInbox(address: string, since: Date, max = 25): Promise<InboxItem[]> {
  const snap = await mailIn().where('to', '==', address.toLowerCase()).get();
  return snap.docs
    .map((d) => data<MailIssue>(d))
    .filter((m) => new Date(m.date) >= since)
    .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime())
    .slice(0, max)
    .map((m) => {
      const html = m.html || null;
      const text = m.text?.trim() || htmlToText(html);
      return {
        guid: `gmail:${m.id}`,
        url: html ? viewOnlineLink(html) : null,
        title: (m.subject || text.slice(0, 90) || 'Untitled issue').trim(),
        author: m.from.replace(/\s*<[^>]+>\s*$/, '').replace(/^"|"$/g, '') || null,
        published: new Date(m.date),
        content: text,
        image: html ? firstImage(html, 'https://mail.invalid/') : null,
        html,
      };
    });
}
