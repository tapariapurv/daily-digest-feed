import { fetchText } from './http.ts';

export type Inbox = { email: string; feedUrl: string };

/**
 * Create a private newsletter inbox via kill-the-newsletter.com (free, no account):
 * mail sent to the returned address shows up in the returned Atom feed.
 */
export async function createNewsletterInbox(title: string): Promise<Inbox> {
  const res = await fetch('https://kill-the-newsletter.com/', {
    method: 'POST',
    signal: AbortSignal.timeout(15_000),
    headers: { 'content-type': 'application/x-www-form-urlencoded', accept: 'text/html' },
    body: new URLSearchParams({ title: title.slice(0, 80) || 'Morning Digest' }).toString(),
    redirect: 'follow',
  });
  let html = await res.text();
  // Some versions redirect to a page that shows the inbox; follow it if the POST body is empty.
  if (!/kill-the-newsletter\.com\/feeds\//.test(html) && res.headers.get('location')) {
    html = (await fetchText(new URL(res.headers.get('location')!, 'https://kill-the-newsletter.com').href)).text;
  }
  const email = /([a-z0-9]+@kill-the-newsletter\.com)/i.exec(html)?.[1];
  const feedUrl = /(https:\/\/kill-the-newsletter\.com\/feeds\/[a-z0-9]+\.xml)/i.exec(html)?.[1];
  if (!res.ok || !email || !feedUrl) throw new Error('Couldn’t create an inbox right now — try again in a minute.');
  return { email, feedUrl };
}
