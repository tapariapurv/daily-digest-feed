import { Readability } from '@mozilla/readability';
import { parseHTML } from 'linkedom';
import { fetchText } from './http.ts';
import { collapse } from './text.ts';

const SKIP_HOSTS = /(^|\.)(youtube\.com|youtu\.be|reddit\.com|twitter\.com|x\.com)$/;

export type ExtractedArticle = {
  title: string | null;
  text: string | null;
  image: string | null;
  published: Date | null;
  author: string | null;
};

function meta(html: string, ...names: string[]): string | null {
  for (const name of names) {
    const re = new RegExp(`<meta[^>]+(?:property|name|itemprop)=["']${name}["'][^>]*>`, 'i');
    const tag = re.exec(html)?.[0];
    const content = tag && /content=["']([^"']+)["']/i.exec(tag)?.[1];
    if (content) return content.replace(/&amp;/g, '&').trim();
  }
  return null;
}

function absolute(url: string | null, base: string): string | null {
  if (!url) return null;
  try {
    const u = new URL(url, base);
    return /^https?:$/.test(u.protocol) ? u.href : null;
  } catch {
    return null;
  }
}

/** Parse metadata and main text out of an article's HTML. */
export function parseArticleHtml(html: string, url: string): ExtractedArticle {
  const head = html.slice(0, 200_000);
  const image = absolute(meta(head, 'og:image', 'og:image:url', 'twitter:image', 'twitter:image:src'), url);
  const publishedRaw = meta(head, 'article:published_time', 'og:published_time', 'datePublished', 'pubdate', 'date') ??
    /<time[^>]+datetime=["']([^"']+)["']/i.exec(html)?.[1] ?? null;
  const published = publishedRaw && !Number.isNaN(Date.parse(publishedRaw)) ? new Date(publishedRaw) : null;
  let text: string | null = null;
  let title = meta(head, 'og:title', 'twitter:title');
  let author = meta(head, 'author', 'article:author');
  try {
    const { document } = parseHTML(html);
    const article = new Readability(document as unknown as Document, { charThreshold: 300 }).parse();
    const body = collapse(article?.textContent ?? '');
    text = body.length > 200 ? body : null;
    title = title ?? article?.title ?? null;
    author = author ?? article?.byline ?? null;
  } catch {
    // Readability can choke on unusual markup; metadata alone is still useful.
  }
  return { title: title ? collapse(title) : null, text, image, published, author: author && !/^https?:/.test(author) ? author : null };
}

/** Fetch an article page and pull out its text, image and metadata. Null on any failure. */
export async function extractArticle(url: string, opts: { skipVideoHosts?: boolean } = {}): Promise<ExtractedArticle | null> {
  try {
    if (opts.skipVideoHosts !== false && SKIP_HOSTS.test(new URL(url).hostname)) return null;
    const res = await fetchText(url, { timeoutMs: 9000, accept: 'text/html,application/xhtml+xml' });
    if (res.status >= 400 || !/html/i.test(res.contentType)) return null;
    return parseArticleHtml(res.text, res.url);
  } catch {
    return null;
  }
}
