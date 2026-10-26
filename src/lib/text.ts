import { createHash } from 'node:crypto';
import { parseHTML } from 'linkedom';

const BLOCK_TAGS = /<\/(p|div|li|h[1-6]|blockquote|pre|tr|section|article|figure)>|<br\s*\/?>/gi;

/** Convert an HTML fragment to readable plain text. */
export function htmlToText(html: string | null | undefined): string {
  if (!html) return '';
  if (!/[<&]/.test(html)) return collapse(html);
  const prepared = html
    .replace(/<(script|style|noscript|iframe|svg)[\s\S]*?<\/\1>/gi, ' ')
    .replace(BLOCK_TAGS, '\n\n');
  const { document } = parseHTML(`<!doctype html><html><body>${prepared}</body></html>`);
  return collapse(document.body?.textContent ?? '');
}

export function collapse(text: string): string {
  return text
    .replace(/\r/g, '')
    .replace(/[ \t ]+/g, ' ')
    .replace(/\n\s*\n\s*/g, '\n\n')
    .trim();
}

export function truncate(text: string, max: number): string {
  if (text.length <= max) return text;
  const cut = text.slice(0, max);
  const lastSpace = cut.lastIndexOf(' ');
  return `${cut.slice(0, lastSpace > max * 0.8 ? lastSpace : max)}…`;
}

const TRACKING_PARAMS = /^(utm_[a-z]+|fbclid|gclid|mc_cid|mc_eid|ref|ref_src|source|cmpid|_hsenc|_hsmi|mkt_tok)$/i;

/** Canonical form of an article URL so the same story is recognised across feeds and runs. */
export function canonicalUrl(raw: string): string | null {
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    return null;
  }
  if (!/^https?:$/.test(url.protocol)) return null;
  url.hash = '';
  url.hostname = url.hostname.toLowerCase().replace(/^www\./, '');
  for (const key of [...url.searchParams.keys()]) {
    if (TRACKING_PARAMS.test(key)) url.searchParams.delete(key);
  }
  url.searchParams.sort();
  const path = url.pathname.replace(/\/+$/, '') || '/';
  const query = url.searchParams.toString();
  return `${url.hostname}${path}${query ? `?${query}` : ''}`;
}

export function dedupeKey(parts: { url?: string | null; guid?: string | null; fallback: string }): string {
  const basis =
    (parts.url && canonicalUrl(parts.url)) || (parts.guid ? `guid:${parts.guid}` : null) || `fb:${parts.fallback}`;
  return createHash('sha1').update(basis).digest('hex');
}

export function hostOf(url: string | null | undefined): string {
  if (!url) return '';
  try {
    return new URL(url).hostname.replace(/^www\./, '');
  } catch {
    return '';
  }
}

/** Run `fn` over `items` with at most `limit` in flight. */
export async function mapLimit<T, R>(items: T[], limit: number, fn: (item: T, index: number) => Promise<R>): Promise<R[]> {
  const results = new Array<R>(items.length);
  let next = 0;
  const workers = Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (next < items.length) {
      const i = next++;
      results[i] = await fn(items[i], i);
    }
  });
  await Promise.all(workers);
  return results;
}

export function chunk<T>(items: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < items.length; i += size) out.push(items.slice(i, i + size));
  return out;
}
