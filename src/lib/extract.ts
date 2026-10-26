import { Readability } from '@mozilla/readability';
import { parseHTML } from 'linkedom';
import { fetchText } from './http.ts';
import { collapse } from './text.ts';

const SKIP_HOSTS = /(^|\.)(youtube\.com|youtu\.be|reddit\.com|twitter\.com|x\.com)$/;

/**
 * Fetch an article page and pull out its main text. Used only when the feed
 * itself carries little more than a headline. Returns null on any failure.
 */
export async function extractArticleText(url: string): Promise<string | null> {
  try {
    if (SKIP_HOSTS.test(new URL(url).hostname)) return null;
    const res = await fetchText(url, { timeoutMs: 9000, accept: 'text/html,application/xhtml+xml' });
    if (res.status >= 400 || !/html/i.test(res.contentType)) return null;
    const { document } = parseHTML(res.text);
    const article = new Readability(document as unknown as Document, { charThreshold: 300 }).parse();
    const text = collapse(article?.textContent ?? '');
    return text.length > 200 ? text : null;
  } catch {
    return null;
  }
}
