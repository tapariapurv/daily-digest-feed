import type { AiAuth } from './ai.ts';
import { articleId, articles, commitAll, data, db, FieldValue, getMany, newId, profiles, rows, user, type Article, type LedgerEntry, type Run, type Source } from './db.ts';
import { editionsOf } from './editions.ts';
import { ledgerOf, sourcesOf } from './sources.ts';
import { assembleEdition, summariseBatch } from './editor.ts';
import { extractArticle } from './extract.ts';
import { fetchFeed, type ParsedItem } from './feeds.ts';
import { describeFetchError, fetchText } from './http.ts';
import { fetchInbox, mailboxConfigured } from './mailbox.ts';
import { sendEditionEmail } from './mailer.ts';
import { normaliseDesign, normaliseReading } from './profile.ts';
import { readerAiFrom, type ProfileRow } from './profiles.ts';
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

export const runsOf = (userId: string) => user(userId).collection('runs');

/** Start a run for one reader unless one is already in progress. */
export async function startRun(userId: string, trigger: string): Promise<{ run: Run; started: boolean }> {
  const runs = runsOf(userId);
  const recent = rows<Run>(await runs.where('started_at', '>', new Date(Date.now() - 86400_000)).get());
  for (const r of recent)
    if (r.status === 'running' && Date.now() - new Date(r.started_at).getTime() > 6 * 60_000)
      await runs.doc(String(r.id)).update({ status: 'error', error: 'Timed out', finished_at: new Date() });
  const stale = await runs.where('started_at', '<', new Date(Date.now() - 60 * 86400_000)).limit(20).select().get();
  await commitAll(stale.docs.map((d) => (b: FirebaseFirestore.WriteBatch) => b.delete(d.ref)));
  const running = recent.find((r) => r.status === 'running' && Date.now() - new Date(r.started_at).getTime() <= 6 * 60_000);
  if (running) return { run: running, started: false };
  if (trigger === 'manual') {
    const n = recent.filter((r) => r.trigger === 'manual').length;
    if (n >= MANUAL_RUNS_PER_DAY) throw new RunLimitError(`You’ve refreshed ${n} times today — the next scheduled edition will pick up anything new.`);
  }
  const run: Run = { id: newId(), user_id: userId, started_at: new Date(), finished_at: null, trigger, status: 'running', stage: 'Starting', stats: {}, error: null, edition_id: null };
  await runs.doc(String(run.id)).set(run);
  return { run, started: true };
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
  const unique = [...new Map(rows.map((r) => [r.dedupe_key, { ...r, id: articleId(r.dedupe_key) }])).values()];
  const existing = new Map((await getMany<Article>(articles(), unique.map((r) => r.id))).map((a) => [a.id, a]));
  const seen = new Set((await getMany<LedgerEntry>(ledgerOf(source.user_id), unique.map((r) => r.id))).map((l) => l.article_id));
  const now = new Date();
  const ops: ((b: FirebaseFirestore.WriteBatch) => void)[] = [];
  for (const { status, ...article } of unique) {
    const ref = articles().doc(String(article.id));
    const old = existing.get(article.id);
    if (!old) ops.push((b) => b.set(ref, { ...article, key_points: null, topic: null, tldr: null, summary: null, quality: null, summarized_at: null, summary_attempts: 0, created_at: now }));
    else {
      const patch: Record<string, unknown> = {};
      if (!old.image_url && article.image_url) patch.image_url = article.image_url;
      if (!old.summary && (article.content?.length ?? 0) > (old.content?.length ?? 0)) patch.content = article.content;
      if (Object.keys(patch).length) ops.push((b) => b.update(ref, patch));
    }
    // Anything this reader has seen before is skipped — the no-duplicates guarantee.
    if (!seen.has(article.id)) {
      const entry: LedgerEntry = { article_id: article.id, source_id: source.id, source_title: source.title, status, edition_id: null, seen_at: now };
      ops.push((b) => b.set(ledgerOf(source.user_id).doc(String(article.id)), entry));
    }
  }
  await commitAll(ops);
  return unique.filter((r) => r.status === 'pending' && !seen.has(r.id)).length;
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
  const ref = sourcesOf(source.user_id).doc(source.id);
  if (result.error) await ref.update({ last_fetched_at: new Date(), last_error: truncate(result.error, 300), consecutive_failures: FieldValue.increment(1) });
  else
    await ref.update({
      last_fetched_at: new Date(), last_success_at: new Date(), last_error: null, consecutive_failures: 0,
      etag: result.etag ?? source.etag ?? null, last_modified: result.lastModified ?? source.last_modified ?? null,
    });
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
    const seen = new Set((await getMany<LedgerEntry>(ledgerOf(source.user_id), keys.map(articleId))).map((l) => l.article_id));
    const fresh = links.filter((_, i) => !seen.has(articleId(keys[i])));
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

/** This reader's pending ledger entries joined with the shared articles. */
async function pendingArticles(userId: string): Promise<PendingRow[]> {
  const ledger = rows<LedgerEntry>(await ledgerOf(userId).where('status', '==', 'pending').get());
  const titles = new Map(ledger.map((l) => [l.article_id, l.source_title]));
  const list = await getMany<Article>(articles(), ledger.map((l) => l.article_id));
  return list.map((a) => ({ ...a, source_title_ua: titles.get(a.id) ?? a.source_title }));
}
const byNewest = (a: Article, b: Article) => (b.published_at ? +new Date(b.published_at) : 0) - (a.published_at ? +new Date(a.published_at) : 0) || b.id - a.id;
const setLedger = (userId: string, ids: number[], patch: Partial<LedgerEntry>) =>
  commitAll(ids.map((id) => (b: FirebaseFirestore.WriteBatch) => b.update(ledgerOf(userId).doc(String(id)), patch)));

export async function executeRun(runId: number, userId: string, opts: { deadline?: number } = {}): Promise<void> {
  const t0 = Date.now();
  const deadline = opts.deadline ?? t0 + 230_000;
  const stats: RunStats = { sources: 0, failedSources: 0, newItems: 0, summarised: 0, cached: 0, queued: 0, editionItems: 0, extracted: 0 };
  const runRef = runsOf(userId).doc(String(runId));
  const stage = (text: string) => runRef.update({ stage: text, stats: { ...stats } });
  // Set once the reader's own AI provider is known; recorded on the profile when the run ends.
  let keyIssue: string | null = null;
  let usesOwnKey = false;
  const finish = async (status: 'done' | 'error', text: string, extra: { error?: string; editionId?: number } = {}) => {
    await runRef.update({ status, stage: text, stats: { ...stats }, finished_at: new Date(), error: extra.error ?? null, edition_id: extra.editionId ?? null });
    if (usesOwnKey) await profiles().doc(userId).update({ gemini_key_error: keyIssue });
  };

  try {
    const snap = await profiles().doc(userId).get();
    if (!snap.exists) throw new Error('Profile not found');
    const profile = data<ProfileRow>(snap);
    const reading = normaliseReading(profile.reading);
    const design = normaliseDesign(profile.design);
    // The reader's own AI provider, if any; problems with it are recorded and the shared key takes over.
    const reader = readerAiFrom(profile.ai, profile.gemini_key_enc);
    usesOwnKey = !!reader;
    const ai: AiAuth = { reader, onKeyFallback: (reason) => (keyIssue = reason) };

    // 1. Fetch every enabled source.
    const sources = rows<Source>(await sourcesOf(userId).where('enabled', '==', true).get());
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
    const pending = (await pendingArticles(userId)).sort(byNewest).slice(0, 200);
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
        a.published_at = a.published_at ?? page.published ?? null;
        a.author = a.author ?? page.author ?? null;
        await articles().doc(String(a.id)).update({ content: a.content, image_url: a.image_url ?? null, published_at: a.published_at, author: a.author });
      });
    }

    let lastError: string | null = null;
    if (needSummary.length) {
      await stage(`Summarising ${needSummary.length} article${needSummary.length === 1 ? '' : 's'}`);
      // ponytail: samples the 500 latest summaries for topic names; a counter doc if this gets slow.
      const recent = await articles().where('summarized_at', '>', new Date(Date.now() - 30 * 86400_000)).orderBy('summarized_at', 'desc').limit(500).select('topic').get();
      const tally = new Map<string, number>();
      for (const d of recent.docs) if (d.get('topic')) tally.set(d.get('topic'), (tally.get(d.get('topic')) ?? 0) + 1);
      const knownTopics = [...tally].sort((x, y) => y[1] - x[1]).slice(0, 30).map(([t]) => t);
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
          await commitAll(
            items.map((s) => (b: FirebaseFirestore.WriteBatch) =>
              b.update(articles().doc(String(s.id)), { tldr: s.tldr, summary: s.summary, key_points: s.key_points, topic: s.topic, quality: s.quality, summarized_at: new Date(), content: null }),
            ),
          );
          for (const s of items) {
            const a = batch.find((x) => x.id === s.id);
            if (a) Object.assign(a, { tldr: s.tldr, summary: s.summary, key_points: s.key_points, topic: s.topic, quality: s.quality });
          }
          stats.summarised += items.length;
          const returned = new Set(items.map((s) => s.id));
          const missed = batch.filter((a) => !returned.has(a.id)).map((a) => a.id);
          await bumpAttempts(missed);
        } catch (err) {
          lastError = err instanceof Error ? err.message : String(err);
          console.error('summariseBatch failed', lastError);
          await bumpAttempts(batch.map((a) => a.id));
        }
        await stage(`Summarising ${needSummary.length} articles (${stats.summarised} done)`);
      });
    }
    // Give up on articles that repeatedly fail to summarise.
    const all = await pendingArticles(userId);
    await setLedger(userId, all.filter((a) => !a.summary && (a.summary_attempts ?? 0) + (needSummary.some((n) => n.id === a.id && !n.summary) ? 1 : 0) >= MAX_ATTEMPTS).map((a) => a.id), { status: 'failed' });

    // 3. Assemble this reader's edition.
    const ready = all
      .filter((a) => a.summary)
      .sort((a, b) => (b.quality ?? 0) - (a.quality ?? 0) || byNewest(a, b))
      .slice(0, 120);
    stats.queued = all.length - ready.length;

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
          if (page?.image) await articles().doc(String(a.id)).update({ image_url: page.image });
        });
      }
    }

    const mainIds = [...draft.layout.lead, ...draft.layout.sections.flatMap((s) => s.ids)];
    const sourceCount = new Set(mainIds.map((id) => byId.get(id)?.source_title_ua)).size;
    const editionId = newId();
    const [runSnap] = await Promise.all([runRef.get()]);
    await editionsOf(userId).doc(String(editionId)).set({
      id: editionId, user_id: userId, created_at: new Date(), headline: draft.headline, intro: draft.intro, layout: draft.layout,
      item_count: mainIds.length, source_count: sourceCount, model: draft.model, trigger: runSnap.get('trigger') ?? null, emailed_at: null,
    });
    const chosenSet = new Set(chosen);
    await setLedger(userId, chosen, { status: 'done', edition_id: editionId });
    // Stories that didn't make the cut are marked seen so they don't come back tomorrow.
    await setLedger(userId, ready.filter((a) => !chosenSet.has(a.id)).map((a) => a.id), { status: 'skipped' });
    stats.editionItems = mainIds.length;

    if (profile.email_delivery) {
      await stage('Sending the email');
      try {
        if (await sendEditionEmail(userId, editionId)) await editionsOf(userId).doc(String(editionId)).update({ emailed_at: new Date() });
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

const bumpAttempts = (ids: number[]) =>
  commitAll(ids.map((id) => (b: FirebaseFirestore.WriteBatch) => b.update(articles().doc(String(id)), { summary_attempts: FieldValue.increment(1) })));

/** Housekeeping: keep the free database small. */
export async function prune(): Promise<void> {
  // ponytail: clears bulky text of 3–5 day old articles only; deleting unreferenced articles needs a cross-user scan, add if storage grows.
  const old = await articles().where('created_at', '<', new Date(Date.now() - 3 * 86400_000)).where('created_at', '>', new Date(Date.now() - 5 * 86400_000)).limit(400).select().get();
  await commitAll(old.docs.map((d) => (b: FirebaseFirestore.WriteBatch) => b.update(d.ref, { content: null })));
}
