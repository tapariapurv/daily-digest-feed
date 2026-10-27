// Newsletter inbox on the app's own Gmail account: each reader gets a private
// plus-address (digest+token@gmail.com); issues are read over IMAP and become stories.
import { randomBytes } from 'node:crypto';
import { ImapFlow } from 'imapflow';
import { simpleParser } from 'mailparser';
import { firstImage, type ParsedItem } from './feeds';
import { htmlToText } from './text';

export function mailboxConfigured(): boolean {
  return !!(process.env.SMTP_USER && process.env.SMTP_PASS && /@/.test(process.env.SMTP_USER));
}

export function newInboxAddress(): { token: string; email: string } {
  const [local, domain] = process.env.SMTP_USER!.split('@');
  const alphabet = 'abcdefghjkmnpqrstuvwxyz23456789';
  const token = Array.from(randomBytes(10), (b) => alphabet[b % alphabet.length]).join('');
  return { token, email: `${local}+${token}@${domain}` };
}

export type InboxItem = ParsedItem & { html: string | null };

const VIEW_ONLINE = /view (it |this )?(email |newsletter )?(in|on) (your |a )?(web )?browser|read (it )?online|view online|web version|open in browser|read on (the )?web/i;

function viewOnlineLink(html: string): string | null {
  for (const m of html.matchAll(/<a\b[^>]*href=["'](https?:\/\/[^"']+)["'][^>]*>([\s\S]*?)<\/a>/gi)) {
    if (VIEW_ONLINE.test(htmlToText(m[2]))) return m[1].replace(/&amp;/g, '&');
  }
  return null;
}

/** Newest messages sent to one reader's address since `since`. */
export async function fetchInbox(address: string, since: Date, max = 25): Promise<InboxItem[]> {
  const client = new ImapFlow({
    host: process.env.IMAP_HOST ?? 'imap.gmail.com',
    port: Number(process.env.IMAP_PORT ?? 993),
    secure: true,
    auth: { user: process.env.SMTP_USER!, pass: process.env.SMTP_PASS! },
    logger: false,
    socketTimeout: 30_000,
  });
  await client.connect();
  const items: InboxItem[] = [];
  try {
    // "All Mail" also catches issues Gmail filed under Promotions or archived.
    const boxes = await client.list();
    const lock = await client.getMailboxLock(boxes.find((b) => b.specialUse === '\\All')?.path ?? 'INBOX');
    try {
      const days = Math.max(1, Math.ceil((Date.now() - since.getTime()) / 86_400_000));
      const uids = (await client.search({ gmraw: `to:${address} newer_than:${days}d` }, { uid: true })) || [];
      for await (const msg of client.fetch(uids.slice(-max), { source: true, envelope: true }, { uid: true })) {
        if (!msg.source) continue;
        const mail = await simpleParser(msg.source);
        const html = typeof mail.html === 'string' ? mail.html : null;
        const text = mail.text?.trim() || htmlToText(html);
        items.push({
          guid: mail.messageId ?? `${address}:${msg.uid}`,
          url: html ? viewOnlineLink(html) : null,
          title: (mail.subject || text.slice(0, 90) || 'Untitled issue').trim(),
          author: mail.from?.value?.[0]?.name || mail.from?.value?.[0]?.address || null,
          published: mail.date ?? null,
          content: text,
          image: html ? firstImage(html, 'https://mail.invalid/') : null,
          html: html ? html.slice(0, 400_000) : null,
        });
      }
    } finally {
      lock.release();
    }
  } finally {
    await client.logout().catch(() => client.close());
  }
  return items.sort((a, b) => (b.published?.getTime() ?? 0) - (a.published?.getTime() ?? 0));
}
