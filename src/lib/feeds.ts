import { parseFeed } from '@rowanmanning/feed-parser';
import { describeFetchError, fetchText } from './http.ts';
import { htmlToText, hostOf } from './text.ts';

export type ParsedItem = {
  guid: string | null;
  url: string | null;
  title: string;
  author: string | null;
  published: Date | null;
  content: string;
};

export type ParsedFeed = {
  title: string | null;
  siteUrl: string | null;
  items: ParsedItem[];
};

export type ResolvedSource = {
  feedUrl: string;
  title: string;
  siteUrl: string | null;
  kind: string;
  itemCount: number;
};

const FEED_START = /^\s*(<\?xml[^>]*>\s*)?(<!--[\s\S]*?-->\s*)*(<rss|<feed|<rdf:RDF|<channel)/i;

function looksLikeFeed(text: string, contentType: string): boolean {
  if (FEED_START.test(text.slice(0, 2000))) return true;
  if (/json/.test(contentType) || /^\s*\{/.test(text)) return /jsonfeed\.org\/version/.test(text.slice(0, 500));
  return false;
}

function safeUrl(href: string | null | undefined, base: string): string | null {
  if (!href) return null;
  try {
    const u = new URL(href.trim(), base);
    return /^https?:$/.test(u.protocol) ? u.toString() : null;
  } catch {
    return null;
  }
}

function toDate(value: unknown): Date | null {
  if (!value) return null;
  const d = value instanceof Date ? value : new Date(String(value));
  if (Number.isNaN(d.getTime())) return null;
  // Ignore dates far in the future (bad feed clocks) by clamping to now.
  return d.getTime() > Date.now() + 36 * 3600_000 ? new Date() : d;
}

type JsonFeed = {
  title?: string;
  home_page_url?: string;
  items?: {
    id?: string;
    url?: string;
    external_url?: string;
    title?: string;
    content_html?: string;
    content_text?: string;
    summary?: string;
    date_published?: string;
    authors?: { name?: string }[];
    author?: { name?: string };
  }[];
};

/** Parse RSS, Atom, RDF or JSON Feed text into a normalised shape. */
export function parseFeedText(text: string, feedUrl: string): ParsedFeed {
  if (/^\s*\{/.test(text)) {
    const json = JSON.parse(text) as JsonFeed;
    return {
      title: json.title ?? null,
      siteUrl: safeUrl(json.home_page_url, feedUrl),
      items: (json.items ?? []).map((it) => {
        const content = htmlToText(it.content_html) || it.content_text || it.summary || '';
        return {
          guid: it.id ?? null,
          url: safeUrl(it.url ?? it.external_url, feedUrl),
          title: (it.title || content.slice(0, 90) || 'Untitled').trim(),
          author: it.authors?.[0]?.name ?? it.author?.name ?? null,
          published: toDate(it.date_published),
          content,
        };
      }),
    };
  }

  const feed = parseFeed(text);
  const siteUrl = safeUrl(feed.url, feedUrl);
  return {
    title: feed.title?.trim() || null,
    siteUrl,
    items: feed.items.map((it) => {
      const mediaDescription = (it.media ?? [])
        .map((m) => (m as { description?: string }).description)
        .find(Boolean);
      const content = htmlToText(it.content) || htmlToText(it.description) || htmlToText(mediaDescription) || '';
      const url = safeUrl(it.url, siteUrl ?? feedUrl) ?? (it.id && /^https?:\/\//.test(it.id) ? it.id : null);
      return {
        guid: it.id ?? null,
        url,
        title: (htmlToText(it.title) || content.slice(0, 90) || 'Untitled').trim(),
        author: it.authors?.find((a) => a.name)?.name ?? null,
        published: toDate(it.published ?? it.updated),
        content,
      };
    }),
  };
}

function kindFor(feedUrl: string): string {
  const host = hostOf(feedUrl);
  if (host.endsWith('youtube.com')) return 'youtube';
  if (host.endsWith('reddit.com')) return 'reddit';
  if (host.endsWith('kill-the-newsletter.com')) return 'newsletter';
  if (host.endsWith('substack.com')) return 'newsletter';
  return 'feed';
}

const UNSUPPORTED: Record<string, string> = {
  'x.com': 'X/Twitter no longer offers feeds.',
  'twitter.com': 'X/Twitter no longer offers feeds.',
  'linkedin.com': 'LinkedIn doesn’t offer feeds.',
  'instagram.com': 'Instagram doesn’t offer feeds.',
  'facebook.com': 'Facebook doesn’t offer feeds.',
  'threads.net': 'Threads doesn’t offer feeds.',
};

/** Known sites whose feed location can be derived from the URL without fetching. */
export function knownFeedFor(input: URL): string | null {
  const host = input.hostname.replace(/^www\.|^m\.|^old\./, '');
  const parts = input.pathname.split('/').filter(Boolean);

  if (host === 'youtube.com') {
    const list = input.searchParams.get('list');
    if (list) return `https://www.youtube.com/feeds/videos.xml?playlist_id=${list}`;
    if (parts[0] === 'channel' && parts[1]) return `https://www.youtube.com/feeds/videos.xml?channel_id=${parts[1]}`;
    return null; // @handles need a page fetch to find the channel id
  }
  if (host === 'reddit.com' && parts[0] === 'r' && parts[1]) {
    return `https://www.reddit.com/r/${parts[1]}/${parts[2] && parts[2] !== 'comments' ? `${parts[2]}/` : ''}.rss`;
  }
  if (host === 'medium.com' && parts[0] && parts[0] !== 'feed') return `https://medium.com/feed/${parts[0]}`;
  if (host.endsWith('.medium.com') && parts[0] !== 'feed') return `https://${host}/feed`;
  if (host.endsWith('.substack.com') && parts[0] !== 'feed') return `https://${host}/feed`;
  if (host === 'github.com' && parts.length >= 2 && !parts[2]?.endsWith('.atom')) {
    return `https://github.com/${parts[0]}/${parts[1]}/releases.atom`;
  }
  return null;
}

/** Extract feed URLs advertised in an HTML page, best candidates first. */
export function findFeedLinks(html: string, baseUrl: string): string[] {
  const head = html.slice(0, 400_000);
  const found: string[] = [];
  for (const tag of head.match(/<link\b[^>]*>/gi) ?? []) {
    const rel = /\brel\s*=\s*["']?([^"'>]+)/i.exec(tag)?.[1]?.toLowerCase() ?? '';
    const type = /\btype\s*=\s*["']?([^"'>\s]+)/i.exec(tag)?.[1]?.toLowerCase() ?? '';
    const href = /\bhref\s*=\s*["']([^"']+)["']/i.exec(tag)?.[1] ?? /\bhref\s*=\s*([^\s>]+)/i.exec(tag)?.[1];
    if (!rel.split(/\s+/).includes('alternate')) continue;
    if (!/(rss|atom|feed)\+(xml|json)|application\/xml|text\/xml/.test(type)) continue;
    const url = safeUrl(href?.replace(/&amp;/g, '&'), baseUrl);
    if (url) found.push(url);
  }
  // YouTube channel pages sometimes only expose the id in page data.
  if (!found.length && hostOf(baseUrl).endsWith('youtube.com')) {
    const id = /"(?:externalId|channelId)":"(UC[\w-]{22})"/.exec(html)?.[1];
    if (id) found.push(`https://www.youtube.com/feeds/videos.xml?channel_id=${id}`);
  }
  const unique = [...new Set(found)];
  // Prefer main feeds over comment feeds.
  return unique.sort((a, b) => Number(/comment/i.test(a)) - Number(/comment/i.test(b)));
}

const COMMON_PATHS = ['/feed', '/rss', '/feed.xml', '/rss.xml', '/atom.xml', '/index.xml', '/feed.json', '/blog/feed', '/blog/rss.xml', '/feeds/posts/default'];

async function tryFeed(url: string): Promise<{ feedUrl: string; feed: ParsedFeed } | null> {
  try {
    const res = await fetchText(url, { timeoutMs: 8000 });
    if (res.status >= 400 || !looksLikeFeed(res.text, res.contentType)) return null;
    const feed = parseFeedText(res.text, res.url);
    return { feedUrl: res.url, feed };
  } catch {
    return null;
  }
}

export function normaliseInput(raw: string): URL {
  let text = raw.trim().replace(/^feed:(\/\/)?/i, 'https://');
  if (!/^https?:\/\//i.test(text)) text = `https://${text}`;
  const url = new URL(text);
  if (!url.hostname.includes('.')) throw new Error('That doesn’t look like a web address.');
  return url;
}

/**
 * Turn whatever the user pasted (homepage, article, feed URL, YouTube channel,
 * subreddit…) into a working feed. Throws an Error with a human-readable message.
 */
export async function resolveSource(raw: string): Promise<ResolvedSource> {
  let input: URL;
  try {
    input = normaliseInput(raw);
  } catch (e) {
    throw new Error(e instanceof Error && e.message.includes('web address') ? e.message : 'That doesn’t look like a web address.');
  }
  const bareHost = input.hostname.replace(/^www\.|^m\./, '');
  if (UNSUPPORTED[bareHost]) throw new Error(UNSUPPORTED[bareHost]);

  const done = (feedUrl: string, feed: ParsedFeed): ResolvedSource => ({
    feedUrl,
    title: feed.title || hostOf(feed.siteUrl ?? feedUrl) || feedUrl,
    siteUrl: feed.siteUrl ?? `${input.protocol}//${input.host}`,
    kind: kindFor(feedUrl),
    itemCount: feed.items.length,
  });

  const known = knownFeedFor(input);
  if (known) {
    const hit = await tryFeed(known);
    if (hit) return done(hit.feedUrl, hit.feed);
  }

  let page;
  try {
    page = await fetchText(input.toString(), { timeoutMs: 10_000 });
  } catch (e) {
    throw new Error(`Couldn’t reach ${input.hostname}: ${describeFetchError(e)}`);
  }

  if (page.status < 400 && looksLikeFeed(page.text, page.contentType)) {
    try {
      return done(page.url, parseFeedText(page.text, page.url));
    } catch {
      throw new Error('Found a feed but couldn’t read it — it may be malformed.');
    }
  }

  if (page.status < 400) {
    for (const link of findFeedLinks(page.text, page.url).slice(0, 3)) {
      const hit = await tryFeed(link);
      if (hit) return done(hit.feedUrl, hit.feed);
    }
  }

  // Guess common locations, relative to the path the user gave and to the site root.
  const base = new URL(page.url || input.toString());
  const roots = new Set([`${base.origin}${base.pathname.replace(/\/+$/, '')}`, base.origin]);
  const guesses = [...roots].flatMap((root) => COMMON_PATHS.map((p) => `${root}${p}`));
  const results = await Promise.all([...new Set(guesses)].map(tryFeed));
  const hit = results.find((r) => r && r.feed.items.length > 0) ?? results.find(Boolean);
  if (hit) return done(hit.feedUrl, hit.feed);

  if (page.status === 403 || page.status === 429) {
    throw new Error(`${input.hostname} blocked the request (HTTP ${page.status}). Try pasting its feed URL directly.`);
  }
  if (page.status >= 400) throw new Error(`${input.hostname} returned HTTP ${page.status}.`);
  throw new Error('No feed found on that page. If it’s an email-only newsletter, use a kill-the-newsletter.com address.');
}

export type FeedFetchResult =
  | { notModified: true; etag: string | null; lastModified: string | null }
  | { notModified: false; feed: ParsedFeed; etag: string | null; lastModified: string | null };

export async function fetchFeed(feedUrl: string, cache: { etag: string | null; lastModified: string | null }): Promise<FeedFetchResult> {
  const headers: Record<string, string> = {};
  if (cache.etag) headers['if-none-match'] = cache.etag;
  if (cache.lastModified) headers['if-modified-since'] = cache.lastModified;
  const res = await fetchText(feedUrl, { timeoutMs: 15_000, headers });
  const etag = res.headers.get('etag');
  const lastModified = res.headers.get('last-modified');
  if (res.status === 304) return { notModified: true, etag: etag ?? cache.etag, lastModified: lastModified ?? cache.lastModified };
  if (res.status >= 400) throw new Error(`HTTP ${res.status}`);
  if (!looksLikeFeed(res.text, res.contentType)) throw new Error('No longer returns a feed');
  return { notModified: false, feed: parseFeedText(res.text, res.url), etag, lastModified };
}
