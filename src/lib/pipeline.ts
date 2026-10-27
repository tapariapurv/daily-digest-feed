import type { AiAuth } from './ai.ts';
import { sql, type Article, type Run, type Source } from './db.ts';
import { assembleEdition, summariseBatch } from './editor.ts';
import { extractArticle } from './extract.ts';
import { fetchFeed, type ParsedItem } from './feeds.ts';
import { describeFetchError, fetchText } from './http.ts';
import { fetchInbox, mailboxConfigured } from './mailbox.ts';
import { sendEditionEmail } from './mailer.ts';
import { normaliseDesign, normaliseReading } from './profile.ts';
import { readerAiFrom } from './profiles.ts';
import { extractLinks, pickArticleLinks, type PageLink } from './scrape.ts';
import { chunk, dedupeKey, mapLimit, truncate } from './text.ts';

const DAY = 24 * 3600_000;
/** A brand-new source contributes at most this many recent posts to its first edition. */
const FIRST_FETCH_KEEP = 3;
const FIRST_FETCH_MAX_AGE = 14 * DAY;
/** Afterwards, ignore "new" posts older than this (feeds that reshuffle or backfill). */
const MAX_AGE = 10 * DAY;
/** Per-run cap on articles sent to Gemini for one reader; the rest wait for the next run. */
const MAX_SUMMARISE_PER_RUN = 80;
const BATCH_SIZE = 20;
const THIN_CONTENT = 500;
const MAX_ATTEMPTS = 3;
/** Manual refreshes per reader per day — protects the shared free Gemini quota. */
export const MANUAL_RUNS_PER_DAY = 12;

export type RunStats = {
  sources: number;
  failedSources: number;
  newItems: number;
  summarised: number;
  cached: number;
  queued: number;
  editionItems: number;
  extracted: number;
};

export class RunLimitError extends Error {}

/** Start a run for one reader unless one is already in progress (unique partial index). */
export async function startRun(userId: string, trigger: string): Promise<{ run: Run; started: boolean }> {
  await sql`
    update app.runs set status = 'error', error = 'Timed out', finished_at = now()
    where user_id = ${userId} and status = 'running' and started_at < now() - interval '6 minutes'`;
  if (trigger === 'manual') {
    const [{ n }] = await sql<{ n: number }[]>`
      select count(*)::int as n from app.runs where user_id = ${userId} and trigger = 'manual' and started_at > now() - interval '1 day'`;
    if (n >= MANUAL_RUNS_PER_DAY) throw new RunLimitError(`You’ve refreshed ${n} times today — the next scheduled edition will pick up anything new.`);
  }
  const inserted = await sql<Run[]>`
    insert into app.runs (user_id, trigger, stage) values (${userId}, ${trigger}, 'Starting')
    on conflict do nothing returning *`;
  if (inserted[0]) return { run: inserted[0], started: true };
  const [running] = await sql<Run[]>`select * from app.runs where user_id = ${userId} and status = 'running' limit 1`;
  return { run: running, started: false };
}

type NewItem = ParsedItem & { status: 'pending' | 'skipped'; html?: string | null };

/** Upsert articles into the shared table and record them in this reader's seen-ledger. Returns how many are new + pending. */
async function recordItems(source: Source, items: NewItem[]): Promise<number> {
  if (!items.length) return 0;
  const rows = items.map((item) => ({
    dedupe_key: dedupeKey({ url: item.url, guid: item.guid, fallback: `${source.feed_url}:${item.title}` }),
    url: item.url ?? source.site_url ?? source.feed_url,
    title: truncate(item.title, 300),
    author: item.author ? truncate(item.author, 120) : null,
    source_title: source.title,
    published_at: item.published,
    image_url: item.image,
    content: item.status === 'pending' && item.content ? truncate(item.content, 12_000) : null,
    body_html: item.html ?? null,
    status: item.status,
  }));
  const unique = [...new Map(rows.map((r) => [r.dedupe_key, r])).values()];
  await sql`
    insert into app.articles ${sql(unique.map(({ status: _status, ...article }) => article))}
    on conflict (dedupe_key) do update set
      image_url = coalesce(app.articles.image_url, excluded.image_url),
      content = excluded.content
    where (app.articles.image_url is null and excluded.image_url is not null)
       or (app.articles.summary is null and length(coalesce(excluded.content, '')) > length(coalesce(app.articles.content, '')))`;
  const ids = await sql<{ id: number; dedupe_key: string }[]>`
    select id, dedupe_key from app.articles where dedupe_key = any(${unique.map((r) => r.dedupe_key)})`;
  const idByKey = new Map(ids.map((r) => [r.dedupe_key, r.id]));
  const ledger = unique
    .filter((r) => idByKey.has(r.dedupe_key))
    .map((r) => ({ user_id: source.user_id, article_id: idByKey.get(r.dedupe_key)!, source_id: source.id, source_title: source.title, status: r.status }));
  // Anything this reader has seen before hits the primary key and is ignored — the no-duplicates guarantee.
  const inserted = await sql<{ status: string }[]>`
    insert into app.user_articles ${sql(ledger)}
    on conflict (user_id, article_id) do nothing
    returning status`;
  return inserted.filter((r) => r.status === 'pending').length;
}

function choose<T extends ParsedItem>(items: T[], firstTime: boolean, perSource: number): (T & NewItem)[] {
  const now = Date.now();
  const sorted = items
    .map((item, index) => ({ item, index }))
    .sort((a, b) => (b.item.published?.getTime() ?? -Infinity) - (a.item.published?.getTime() ?? -Infinity) || a.index - b.index)
    .map(({ item }) => item);
  let kept = 0;
  const cap = firstTime ? Math.min(FIRST_FETCH_KEEP, perSource) : perSource;
  return sorted.map((item) => {
    const age = item.published ? now - item.published.getTime() : null;
    const fresh = kept < cap && (age === null || age < (firstTime ? FIRST_FETCH_MAX_AGE : MAX_AGE));
    if (fresh) kept++;
    return { ...item, status: fresh ? ('pending' as const) : ('skipped' as const) };
  });
}

async function markSource(source: Source, result: { error?: string; etag?: string | null; lastModified?: string | null }) {
  if (result.error) {
    await sql`
      update app.sources set last_fetched_at = now(), last_error = ${truncate(result.error, 300)}, consecutive_failures = consecutive_failures + 1
      where id = ${source.id}`;
  } else {
    await sql`
      update app.sources set last_fetched_at = now(), last_success_at = now(), last_error = null, consecutive_failures = 0,
        etag = coalesce(${result.etag ?? null}, etag), last_modified = coalesce(${result.lastModified ?? null}, last_modified)
      where id = ${source.id}`;
  }
}

/** Fetch one feed source and record unseen items. */
/** Newsletter inbox: issues sent to the reader's private address since the last check. */
async function ingestInboxSource(source: Source, perSource: number): Promise<{ newItems: number; error?: string }> {
  if (!mailboxConfigured() || !source.inbox_email) return { newItems: 0, error: 'Email inbox isn’t set up on this server' };
  try {
    const since = new Date(Math.min(Date.now() - DAY, (source.last_success_at ? new Date(source.last_success_at).getTime() : Date.now()) - DAY));
    const issues = await fetchInbox(source.inbox_email, since);
    const newItems = await recordItems(source, choose(issues, false, Math.max(perSource, 5)));
    await markSource(source, {});
    return { newItems };
  } catch (err) {
    const error = describeFetchError(err);
    await markSource(source, { error });
    return { newItems: 0, error };
  }
}

export async function ingestFeedSource(source: Source, perSource: number): Promise<{ newItems: number; error?: string }> {
  try {
    const res = await fetchFeed(source.feed_url, { etag: source.etag, lastModified: source.last_modified });
    let newItems = 0;
    if (!res.notModified) newItems = await recordItems(source, choose(res.feed.items, !source.last_success_at, perSource));
    await markSource(source, { etag: res.etag, lastModified: res.lastModified });
    return { newItems };
  } catch (err) {
    const error = describeFetchError(err);
    await markSource(source, { error });
    return { newItems: 0, error };
  }
}

/** Feedless sources: the links were picked already; read only the ones this reader hasn't seen. */
async function ingestPageSource(source: Source, links: PageLink[], perSource: number): Promise<{ newItems: number; error?: string }> {
  try {
    const keys = links.map((l) => dedupeKey({ url: l.url, fallback: l.url }));
    const seenRows = await sql<{ dedupe_key: string }[]>`
      select a.dedupe_key from app.articles a join app.user_articles ua on ua.article_id = a.id
      where ua.user_id = ${source.user_id} and a.dedupe_key = any(${keys})`;
    const seen = new Set(seenRows.map((r) => r.dedupe_key));
    const fresh = links.filter((_, i) => !seen.has(keys[i]));
    const firstTime = !source.last_success_at;
    const cap = firstTime ? Math.min(FIRST_FETCH_KEEP, perSource) : perSource;
    const toRead = fresh.slice(0, cap);
    const read = await mapLimit(toRead, 4, async (link): Promise<NewItem> => {
      const page = await extractArticle(link.url, { skipVideoHosts: false });
      return {
        guid: null,
        url: link.url,
        title: page?.title || link.text || link.url,
        author: page?.author ?? null,
        published: page?.published ?? null,
        content: page?.text ?? '',
        image: page?.image ?? null,
        status: 'pending',
      };
    });
    const skipped: NewItem[] = fresh.slice(cap).map((l) => ({ guid: null, url: l.url, title: l.text || l.url, author: null, published: null, content: '', image: null, status: 'skipped' }));
    const newItems = await recordItems(source, [...read, ...skipped]);
    await markSource(source, {});
    return { newItems };
  } catch (err) {
    const error = describeFetchError(err);
    await markSource(source, { error });
    return { newItems: 0, error };
  }
}

type PendingRow = Article & { source_title_ua: string };

export async function executeRun(runId: number, userId: string, opts: { deadline?: number } = {}): Promise<void> {
  const t0 = Date.now();
  const deadline = opts.deadline ?? t0 + 230_000;
  const stats: RunStats = { sources: 0, failedSources: 0, newItems: 0, summarised: 0, cached: 0, queued: 0, editionItems: 0, extracted: 0 };
  const stage = (text: string) => sql`update app.runs set stage = ${text}, stats = ${sql.json(stats)} where id = ${runId}`;
  // Set once the reader's own AI provider is known; recorded on the profile when the run ends.
  let keyIssue: string | null = null;
  let usesOwnKey = false;
  const finish = async (status: 'done' | 'error', text: string, extra: { error?: string; editionId?: number } = {}) => {
    await sql`
      update app.runs set status = ${status}, stage = ${text}, stats = ${sql.json(stats)}, finished_at = now(),
        error = ${extra.error ?? null}, edition_id = ${extra.editionId ?? null}
      where id = ${runId}`;
    if (usesOwnKey) await sql`update app.profiles set gemini_key_error = ${keyIssue} where user_id = ${userId}`;
  };

  try {
    const [profile] = await sql<{ interests: string; reading: object; design: object; ai: object; gemini_key_enc: string | null; email_delivery: boolean }[]>`
      select interests, reading, design, ai, gemini_key_enc, email_delivery from app.profiles where user_id = ${userId}`;
    if (!profile) throw new Error('Profile not found');
    const reading = normaliseReading(profile.reading);
    const design = normaliseDesign(profile.design);
    // The reader's own AI provider, if any; problems with it are recorded and the shared key takes over.
    const reader = readerAiFrom(profile.ai, profile.gemini_key_enc);
    usesOwnKey = !!reader;
    const ai: AiAuth = { reader, onKeyFallback: (reason) => (keyIssue = reason) };

    // 1. Fetch every enabled source.
    const sources = await sql<Source[]>`select * from app.sources where user_id = ${userId} and enabled order by created_at`;
    stats.sources = sources.length;
    await stage(`Checking ${sources.length} source${sources.length === 1 ? '' : 's'}`);
    const feeds = sources.filter((s) => s.kind !== 'page' && s.kind !== 'inbox');
    const pages = sources.filter((s) => s.kind === 'page');
    const inboxes = sources.filter((s) => s.kind === 'inbox');
    const feedResults = await mapLimit(feeds, 6, (s) => ingestFeedSource(s, reading.perSource));
    const inboxResults = await mapLimit(inboxes, 1, (s) => ingestInboxSource(s, reading.perSource));

    let pageResults: { newItems: number; error?: string }[] = [];
    if (pages.length) {
      await stage(`Scanning ${pages.length} page${pages.length === 1 ? '' : 's'} for new articles`);
      const fetched = await mapLimit(pages, 4, async (s) => {
        try {
          const res = await fetchText(s.feed_url, { timeoutMs: 12_000, accept: 'text/html' });
          if (res.status >= 400) throw new Error(`HTTP ${res.status}`);
          return { source: s, links: extractLinks(res.text, res.url) };
        } catch (err) {
          return { source: s, error: describeFetchError(err) };
        }
      });
      const ok = fetched.filter((f): f is { source: Source; links: PageLink[] } => 'links' in f);
      const picked = await pickArticleLinks(ok.map((f) => ({ key: f.source.id, url: f.source.feed_url, links: f.links })), ai);
      pageResults = await mapLimit(fetched, 3, async (f) => {
        if ('error' in f && f.error) {
          await markSource(f.source, { error: f.error });
          return { newItems: 0, error: f.error };
        }
        return ingestPageSource(f.source, picked.get(f.source.id) ?? [], reading.perSource);
      });
    }
    const results = [...feedResults, ...inboxResults, ...pageResults];
    stats.failedSources = results.filter((r) => r.error).length;
    stats.newItems = results.reduce((n, r) => n + r.newItems, 0);

    // 2. Summarise what nobody has summarised yet (shared across readers).
    const pending = await sql<PendingRow[]>`
      select a.*, ua.source_title as source_title_ua from app.user_articles ua join app.articles a on a.id = ua.article_id
      where ua.user_id = ${userId} and ua.status = 'pending'
      order by a.published_at desc nulls last, a.id desc limit 200`;
    const needSummary = pending.filter((a) => !a.summary && a.summary_attempts < MAX_ATTEMPTS).slice(0, MAX_SUMMARISE_PER_RUN);
    stats.cached = pending.filter((a) => a.summary).length;

    const thin = needSummary.filter((a) => (a.content?.length ?? 0) < THIN_CONTENT);
    if (thin.length) {
      await stage(`Reading ${thin.length} article${thin.length === 1 ? '' : 's'}`);
      await mapLimit(thin, 8, async (a) => {
        const page = await extractArticle(a.url);
        if (!page) return;
        if (page.text && page.text.length > (a.content?.length ?? 0)) {
          a.content = truncate(page.text, 12_000);
          stats.extracted++;
        }
        a.image_url = a.image_url ?? page.image;
        await sql`
          update app.articles set content = ${a.content}, image_url = coalesce(image_url, ${page.image}),
            published_at = coalesce(published_at, ${page.published}), author = coalesce(author, ${page.author})
          where id = ${a.id}`;
      });
    }

    let lastError: string | null = null;
    if (needSummary.length) {
      await stage(`Summarising ${needSummary.length} article${needSummary.length === 1 ? '' : 's'}`);
      const topicRows = await sql<{ topic: string }[]>`
        select topic from app.articles where topic is not null and summarized_at > now() - interval '30 days'
        group by topic order by count(*) desc limit 30`;
      const knownTopics = topicRows.map((r) => r.topic);
      await mapLimit(chunk(needSummary, BATCH_SIZE), 2, async (batch) => {
        if (Date.now() > deadline - 60_000) return; // left pending for the next run
        try {
          const { items } = await summariseBatch(
            batch.map((a) => ({
              id: a.id,
              source: a.source_title,
              title: a.title,
              published: a.published_at ? new Date(a.published_at).toISOString().slice(0, 10) : null,
              content: a.content ?? '',
            })),
            { knownTopics, ...ai },
          );
          if (items.length) {
            await sql`
              update app.articles set tldr = v.tldr, summary = v.summary, key_points = v.key_points::jsonb, topic = v.topic,
                quality = v.quality::smallint, summarized_at = now(), content = null
              from (values ${sql(items.map((s) => [String(s.id), s.tldr, s.summary, JSON.stringify(s.key_points), s.topic, String(s.quality)]))})
                as v(id, tldr, summary, key_points, topic, quality)
              where app.articles.id = v.id::bigint`;
          }
          stats.summarised += items.length;
          const returned = new Set(items.map((s) => s.id));
          const missed = batch.filter((a) => !returned.has(a.id)).map((a) => a.id);
          if (missed.length) await sql`update app.articles set summary_attempts = summary_attempts + 1 where id = any(${missed}::bigint[])`;
        } catch (err) {
          lastError = err instanceof Error ? err.message : String(err);
          console.error('summariseBatch failed', lastError);
          await sql`update app.articles set summary_attempts = summary_attempts + 1 where id = any(${batch.map((a) => a.id)}::bigint[])`;
        }
        await stage(`Summarising ${needSummary.length} articles (${stats.summarised} done)`);
      });
    }
    // Give up on articles that repeatedly fail to summarise.
    await sql`
      update app.user_articles ua set status = 'failed' from app.articles a
      where ua.article_id = a.id and ua.user_id = ${userId} and ua.status = 'pending' and a.summary is null and a.summary_attempts >= ${MAX_ATTEMPTS}`;

    // 3. Assemble this reader's edition.
    const ready = await sql<(Article & { source_title_ua: string })[]>`
      select a.*, ua.source_title as source_title_ua from app.user_articles ua join app.articles a on a.id = ua.article_id
      where ua.user_id = ${userId} and ua.status = 'pending' and a.summary is not null
      order by a.quality desc nulls last, a.published_at desc nulls last limit 120`;
    const [{ n: queued }] = await sql<{ n: number }[]>`
      select count(*)::int as n from app.user_articles where user_id = ${userId} and status = 'pending'`;
    stats.queued = queued - ready.length;

    if (!ready.length) {
      if (lastError && needSummary.length) await finish('error', 'Summarising failed', { error: truncate(lastError, 600) });
      else await finish('done', stats.newItems ? 'Nothing new worth an edition' : 'You’re all caught up');
      return;
    }

    await stage(`Writing the edition (${ready.length} candidates)`);
    const draft = await assembleEdition(
      ready.map((a) => ({
        id: a.id,
        title: a.title,
        source: a.source_title_ua,
        topic: a.topic ?? 'Other',
        quality: a.quality ?? 3,
        tldr: a.tldr ?? a.summary ?? '',
        published: a.published_at ? new Date(a.published_at).toISOString().slice(0, 10) : null,
      })),
      { interests: profile.interests, maxStories: reading.maxStories, briefly: reading.briefly, ...ai },
    );
    const chosen = [...draft.layout.lead, ...draft.layout.sections.flatMap((s) => s.ids), ...draft.layout.briefly];
    const byId = new Map(ready.map((a) => [a.id, a]));

    // 4. Pictures for the stories people see first, when the reader wants images.
    if (design.images) {
      const wanted = [...draft.layout.lead, ...draft.layout.sections.flatMap((s) => s.ids.slice(0, 3))]
        .map((id) => byId.get(id)!)
        .filter((a) => a && !a.image_url)
        .slice(0, 10);
      if (wanted.length) {
        await stage('Finding images');
        await mapLimit(wanted, 6, async (a) => {
          const page = await extractArticle(a.url);
          if (page?.image) await sql`update app.articles set image_url = ${page.image} where id = ${a.id} and image_url is null`;
        });
      }
    }

    const mainIds = [...draft.layout.lead, ...draft.layout.sections.flatMap((s) => s.ids)];
    const sourceCount = new Set(mainIds.map((id) => byId.get(id)?.source_title_ua)).size;
    const editionId = await sql.begin(async (tx) => {
      const [edition] = await tx<{ id: number }[]>`
        insert into app.editions (user_id, headline, intro, layout, item_count, source_count, model, trigger)
        select ${userId}, ${draft.headline}, ${draft.intro}, ${tx.json(draft.layout)}, ${mainIds.length}, ${sourceCount}, ${draft.model}, trigger
        from app.runs where id = ${runId}
        returning id`;
      await tx`
        update app.user_articles set status = 'done', edition_id = ${edition.id}
        where user_id = ${userId} and article_id = any(${chosen}::bigint[])`;
      // Stories that didn't make the cut are marked seen so they don't come back tomorrow.
      await tx`
        update app.user_articles set status = 'skipped'
        where user_id = ${userId} and article_id = any(${ready.map((a) => a.id)}::bigint[]) and status = 'pending'`;
      return edition.id;
    });
    stats.editionItems = mainIds.length;

    if (profile.email_delivery) {
      await stage('Sending the email');
      try {
        if (await sendEditionEmail(userId, editionId)) await sql`update app.editions set emailed_at = now() where id = ${editionId}`;
      } catch (err) {
        console.error('email failed', err);
      }
    }
    await finish('done', 'New edition ready', { editionId });
  } catch (err) {
    console.error('run failed', err);
    await finish('error', 'Run failed', { error: truncate(err instanceof Error ? err.message : String(err), 600) }).catch(() => {});
  }
}

/** Housekeeping: keep the free database small. */
export async function prune(): Promise<void> {
  await sql`delete from app.runs where started_at < now() - interval '60 days'`;
  await sql`update app.articles set content = null where content is not null and created_at < now() - interval '3 days'`;
  await sql`update app.articles set body_html = null where body_html is not null and created_at < now() - interval '90 days'`;
  // Articles nobody's ledger references any more.
  await sql`
    delete from app.articles a where a.created_at < now() - interval '120 days'
    and not exists (select 1 from app.user_articles ua where ua.article_id = a.id and ua.status = 'done')
    and not exists (select 1 from app.saved s where s.article_id = a.id)`;
}
