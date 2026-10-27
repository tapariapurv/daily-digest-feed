// Sources without a feed: read the page, find links that are individual articles
// (with Gemini's help), then read those articles directly.
import { generateJSON, type AiAuth } from './ai.ts';
import { canonicalUrl, collapse, hostOf } from './text.ts';

export type PageLink = { url: string; text: string };

const SKIP_PATH =
  /^\/(about|contact|privacy|terms|legal|login|log-in|signin|sign-in|signup|sign-up|register|subscribe|search|cart|account|careers|jobs|help|support|faq|advertise|newsletter|podcasts?)(\/|$)|\/(tag|tags|category|categories|topics?|author|authors|page|archive|feed|rss)(\/|$)/i;
const SKIP_EXT = /\.(pdf|jpe?g|png|gif|webp|svg|zip|mp3|mp4|xml|json|css|js)$/i;

const sameSite = (a: string, b: string) => {
  const ha = hostOf(a);
  const hb = hostOf(b);
  return ha === hb || ha.endsWith(`.${hb}`) || hb.endsWith(`.${ha}`);
};

function decode(text: string): string {
  return text
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&quot;/g, '"')
    .replace(/&#39;|&#x27;|&rsquo;|&lsquo;/g, '’')
    .replace(/&ldquo;|&rdquo;/g, '"')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(Number(n)));
}

/** Same-site links with readable text, in page order, de-duplicated. */
export function extractLinks(html: string, baseUrl: string): PageLink[] {
  const body = html.replace(/<(script|style|noscript|svg|nav|footer)[\s\S]*?<\/\1>/gi, ' ');
  const seen = new Map<string, PageLink>();
  const base = canonicalUrl(baseUrl);
  for (const m of body.matchAll(/<a\b[^>]*?href\s*=\s*["']([^"'#][^"']*)["'][^>]*>([\s\S]*?)<\/a>/gi)) {
    let url: URL;
    try {
      url = new URL(decode(m[1]), baseUrl);
    } catch {
      continue;
    }
    if (!/^https?:$/.test(url.protocol) || !sameSite(url.href, baseUrl)) continue;
    if (SKIP_PATH.test(url.pathname) || SKIP_EXT.test(url.pathname) || url.pathname === '/') continue;
    const key = canonicalUrl(url.href);
    if (!key || key === base) continue;
    const text = collapse(decode(m[2])).replace(/\s+/g, ' ').slice(0, 160);
    const prev = seen.get(key);
    if (!prev) seen.set(key, { url: url.href, text });
    else if (text.length > prev.text.length) prev.text = text;
  }
  return [...seen.values()].filter((l) => l.text.length >= 4).slice(0, 150);
}

export function pageTitle(html: string, url: string): string {
  const og = /<meta[^>]+property=["']og:site_name["'][^>]+content=["']([^"']+)/i.exec(html)?.[1];
  const title = /<title[^>]*>([\s\S]*?)<\/title>/i.exec(html)?.[1];
  const clean = collapse(decode(og ?? title ?? '')).split(/\s[|–—-]\s/)[0].trim();
  return clean || hostOf(url);
}

/** Cheap guess at which links are posts: descriptive text and a slug- or date-like path. */
export function heuristicArticleLinks(links: PageLink[]): PageLink[] {
  return links.filter((l) => {
    const path = new URL(l.url).pathname;
    const slugish = /[a-z0-9]+-[a-z0-9]+-[a-z0-9]+/i.test(path) || /\/\d{4}\/\d{1,2}\//.test(path) || /\/(p|post|posts|blog|article|articles|news|story|stories)\//i.test(path);
    return l.text.split(' ').length >= 4 && slugish;
  });
}

export type PageCandidates = { key: string; url: string; links: PageLink[] };

/**
 * One Gemini call for every feedless source in a run: which links are individual
 * articles (newest first)? Falls back to the heuristic if the model is unavailable.
 */
export async function pickArticleLinks(pages: PageCandidates[], ai: AiAuth = {}, max = 12): Promise<Map<string, PageLink[]>> {
  const result = new Map<string, PageLink[]>();
  const fallback = () => {
    for (const p of pages) result.set(p.key, heuristicArticleLinks(p.links).slice(0, max));
    return result;
  };
  if (!pages.length) return result;
  try {
    const { data } = await generateJSON<{ pages: { key: string; article_link_numbers: number[] }[] }>({
      ...ai,
      models: ['gemini-flash-lite-latest', 'gemini-3.5-flash-lite', 'gemini-3.5-flash'],
      timeoutMs: 45_000,
      system: [
        'You look at the links found on web pages and decide which ones lead to an individual article, post, essay, video or announcement.',
        'Exclude navigation, category/tag/author pages, product pages, sign-up, social, pagination and anything that is not a single piece of content.',
        `Return at most ${max} link numbers per page, most recent / most prominent first (page order usually reflects this).`,
      ].join('\n'),
      prompt: JSON.stringify(
        pages.map((p) => ({ key: p.key, page: p.url, links: p.links.map((l, i) => ({ n: i, text: l.text, path: new URL(l.url).pathname })) })),
      ),
      schema: {
        type: 'object',
        properties: {
          pages: {
            type: 'array',
            items: {
              type: 'object',
              properties: { key: { type: 'string' }, article_link_numbers: { type: 'array', items: { type: 'integer' } } },
              required: ['key', 'article_link_numbers'],
            },
          },
        },
        required: ['pages'],
      },
      temperature: 0,
    });
    for (const p of pages) {
      const picked = data.pages?.find((x) => x.key === p.key)?.article_link_numbers ?? [];
      const links = [...new Set(picked)].map((n) => p.links[n]).filter(Boolean).slice(0, max);
      result.set(p.key, links.length ? links : heuristicArticleLinks(p.links).slice(0, max));
    }
    return result;
  } catch (err) {
    console.error('pickArticleLinks failed, using heuristic', err);
    return fallback();
  }
}
