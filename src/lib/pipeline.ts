import { sql, type Item, type Run, type Source } from './db.ts';
import { assembleEdition, summariseBatch } from './editor.ts';
import { extractArticleText } from './extract.ts';
import { fetchFeed, type ParsedItem } from './feeds.ts';
import { describeFetchError } from './http.ts';
import { getProfile } from './settings.ts';
import { chunk, dedupeKey, mapLimit, truncate } from './text.ts';

const DAY = 24 * 3600_000;
/** A brand-new source contributes at most this many recent posts to its first edition. */
const FIRST_FETCH_KEEP = 3;
const FIRST_FETCH_MAX_AGE = 14 * DAY;
/** Afterwards, ignore "new" posts older than this (feeds that reshuffle or backfill). */
const MAX_AGE = 10 * DAY;
const MAX_NEW_PER_SOURCE = 15;
/** Per-run cap on articles sent to Gemini; the rest wait for the next run. */
const MAX_SUMMARISE_PER_RUN = 150;
const BATCH_SIZE = 20;
const THIN_CONTENT = 500;
/** Stop starting new Gemini batches after this long so the run finishes inside the function limit. */
const SUMMARY_DEADLINE_MS = 200_000;
const MAX_ATTEMPTS = 3;

export type RunStats = {
  sources: number;
  failedSources: number;
  newItems: number;
  summarised: number;
  queued: number;
  editionItems: number;
  thin: number;
  extracted: number;
};

/** Start a run unless one is already in progress (enforced by a unique partial index). */
export async function startRun(trigger: string): Promise<{ run: Run; started: boolean }> {
  await sql`
    update runs set status = 'error', error = 'Timed out', finished_at = now()
    where status = 'running' and started_at < now() - interval '6 minutes'`;
  const inserted = await sql<Run[]>`
    insert into runs (trigger, stage) values (${trigger}, 'Starting')
    on conflict do nothing returning *`;
  if (inserted[0]) return { run: inserted[0], started: true };
  const [running] = await sql<Run[]>`select * from runs where status = 'running' order by started_at desc limit 1`;
  return { run: running, started: false };
}

function rowFor(source: Source, item: ParsedItem, status: 'pending' | 'skipped') {
  return {
    source_id: source.id,
    source_title: source.title,
    dedupe_key: dedupeKey({ url: item.url, guid: item.guid, fallback: `${source.id}:${item.title}` }),
    url: item.url ?? source.site_url ?? source.feed_url,
    title: truncate(item.title, 300),
    author: item.author ? truncate(item.author, 120) : null,
    published_at: item.published,
    content: status === 'pending' ? truncate(item.content, 12_000) : null,
    status,
  };
}

/** Fetch one source and record unseen items. Returns how many new items are queued for summarising. */
export async function ingestSource(source: Source): Promise<{ newItems: number; error?: string }> {
  try {
    const res = await fetchFeed(source.feed_url, { etag: source.etag, lastModified: source.last_modified });
    if (!res.notModified) {
      const now = Date.now();
      const firstTime = !source.last_success_at;
      const items = res.feed.items
        .map((item, index) => ({ item, index }))
        .sort((a, b) => (b.item.published?.getTime() ?? -Infinity) - (a.item.published?.getTime() ?? -Infinity) || a.index - b.index)
        .map(({ item }) => item);

      let kept = 0;
      const rows = items.map((item) => {
        const age = item.published ? now - item.published.getTime() : null;
        const fresh = firstTime
          ? kept < FIRST_FETCH_KEEP && (age === null || age < FIRST_FETCH_MAX_AGE)
          : kept < MAX_NEW_PER_SOURCE && (age === null || age < MAX_AGE);
        if (fresh) kept++;
        return rowFor(source, item, fresh ? 'pending' : 'skipped');
      });

      let newItems = 0;
      if (rows.length) {
        // Items we've already seen hit the unique dedupe_key and are ignored — this is the "no duplicates" guarantee.
        const inserted = await sql<{ status: string }[]>`
          insert into items ${sql(rows)}
          on conflict (dedupe_key) do nothing
          returning status`;
        newItems = inserted.filter((r) => r.status === 'pending').length;
      }
      await sql`
        update sources set last_fetched_at = now(), last_success_at = now(), last_error = null,
          consecutive_failures = 0, etag = ${res.etag}, last_modified = ${res.lastModified}
        where id = ${source.id}`;
      return { newItems };
    }
    await sql`
      update sources set last_fetched_at = now(), last_success_at = now(), last_error = null, consecutive_failures = 0
      where id = ${source.id}`;
    return { newItems: 0 };
  } catch (err) {
    const message = truncate(describeFetchError(err), 300);
    await sql`
      update sources set last_fetched_at = now(), last_error = ${message}, consecutive_failures = consecutive_failures + 1
      where id = ${source.id}`;
    return { newItems: 0, error: message };
  }
}

async function markAttemptFailed(ids: number[]) {
  if (!ids.length) return;
  await sql`
    update items set attempts = attempts + 1,
      status = case when attempts + 1 >= ${MAX_ATTEMPTS} then 'failed' else 'pending' end
    where id = any(${ids}::bigint[])`;
}

export async function executeRun(runId: number): Promise<void> {
  const t0 = Date.now();
  const stats: RunStats = { sources: 0, failedSources: 0, newItems: 0, summarised: 0, queued: 0, editionItems: 0, thin: 0, extracted: 0 };
  const stage = (text: string) => sql`update runs set stage = ${text}, stats = ${sql.json(stats)} where id = ${runId}`;
  const finish = (status: 'done' | 'error', text: string, extra: { error?: string; editionId?: number } = {}) => sql`
    update runs set status = ${status}, stage = ${text}, stats = ${sql.json(stats)}, finished_at = now(),
      error = ${extra.error ?? null}, edition_id = ${extra.editionId ?? null}
    where id = ${runId}`;

  try {
    // 1. Fetch every enabled source.
    const sources = await sql<Source[]>`select * from sources where enabled order by created_at`;
    stats.sources = sources.length;
    await stage(`Checking ${sources.length} source${sources.length === 1 ? '' : 's'}`);
    const results = await mapLimit(sources, 8, ingestSource);
    stats.failedSources = results.filter((r) => r.error).length;
    stats.newItems = results.reduce((n, r) => n + r.newItems, 0);

    // 2. Fill in thin items by reading the article page.
    const pending = await sql<Item[]>`
      select * from items where status = 'pending'
      order by published_at desc nulls last, id desc limit ${MAX_SUMMARISE_PER_RUN}`;
    const thin = pending.filter((i) => (i.content?.length ?? 0) < THIN_CONTENT);
    stats.thin = thin.length;
    if (thin.length) {
      await stage(`Reading ${thin.length} article${thin.length === 1 ? '' : 's'}`);
      await mapLimit(thin, 8, async (item) => {
        const text = await extractArticleText(item.url);
        if (text && text.length > (item.content?.length ?? 0)) {
          item.content = truncate(text, 12_000);
          stats.extracted++;
          await sql`update items set content = ${item.content} where id = ${item.id}`;
        }
      });
    }

    // 3. Summarise in batches — a handful of Gemini calls per day keeps us well inside the free tier.
    let lastError: string | null = null;
    if (pending.length) {
      await stage(`Summarising ${pending.length} article${pending.length === 1 ? '' : 's'}`);
      const profile = await getProfile();
      const topicRows = await sql<{ topic: string }[]>`
        select topic from items where status = 'done' and topic is not null and fetched_at > now() - interval '30 days'
        group by topic order by count(*) desc limit 30`;
      const knownTopics = topicRows.map((r) => r.topic);

      await mapLimit(chunk(pending, BATCH_SIZE), 3, async (batch) => {
        if (Date.now() - t0 > SUMMARY_DEADLINE_MS) return; // left pending for the next run
        try {
          const { items } = await summariseBatch(
            batch.map((i) => ({
              id: i.id,
              source: i.source_title,
              title: i.title,
              published: i.published_at ? new Date(i.published_at).toISOString().slice(0, 10) : null,
              content: i.content ?? '',
            })),
            { interests: profile.interests, knownTopics },
          );
          if (items.length) {
            await sql`
              update items set summary = v.summary, topic = v.topic, importance = v.importance::smallint, status = 'done'
              from (values ${sql(items.map((s) => [String(s.id), s.summary, s.topic, String(s.importance)]))})
                as v(id, summary, topic, importance)
              where items.id = v.id::bigint`;
          }
          stats.summarised += items.length;
          const returned = new Set(items.map((s) => s.id));
          await markAttemptFailed(batch.filter((i) => !returned.has(i.id)).map((i) => i.id));
        } catch (err) {
          lastError = err instanceof Error ? err.message : String(err);
          console.error('summariseBatch failed', lastError);
          await markAttemptFailed(batch.map((i) => i.id));
        }
        await stage(`Summarising ${pending.length} articles (${stats.summarised} done)`);
      });
    }
    const [{ count: queued }] = await sql<{ count: number }[]>`select count(*)::int as count from items where status = 'pending'`;
    stats.queued = queued;

    // 4. Assemble the edition from everything summarised but not yet published.
    const ready = await sql<Item[]>`
      select * from items where status = 'done' and edition_id is null
      order by importance desc, published_at desc nulls last`;
    if (!ready.length) {
      if (lastError && pending.length) {
        await finish('error', 'Summarising failed', { error: truncate(lastError, 600) });
      } else {
        await finish('done', stats.newItems ? 'Nothing new worth an edition' : 'You’re all caught up');
      }
      return;
    }

    await stage(`Writing the edition (${ready.length} stories)`);
    const profile = await getProfile();
    const draft = await assembleEdition(
      ready.map((i) => ({
        id: i.id,
        title: i.title,
        source: i.source_title,
        topic: i.topic ?? 'Other',
        importance: i.importance ?? 3,
        summary: i.summary ?? '',
      })),
      { interests: profile.interests },
    );
    const ids = ready.map((i) => i.id);
    const sourceCount = new Set(ready.map((i) => i.source_title)).size;
    const editionId = await sql.begin(async (tx) => {
      const [edition] = await tx<{ id: number }[]>`
        insert into editions (headline, intro, layout, item_count, source_count, model)
        values (${draft.headline}, ${draft.intro}, ${tx.json(draft.layout)}, ${ids.length}, ${sourceCount}, ${draft.model})
        returning id`;
      // Content is only needed for summarising; drop it to keep the free database small.
      await tx`update items set edition_id = ${edition.id}, content = null where id = any(${ids}::bigint[])`;
      return edition.id;
    });
    stats.editionItems = ids.length;
    await finish('done', 'New edition ready', { editionId });
  } catch (err) {
    console.error('run failed', err);
    await finish('error', 'Run failed', { error: truncate(err instanceof Error ? err.message : String(err), 600) }).catch(() => {});
  }
}

/** Housekeeping: keep the database lean. */
export async function prune(): Promise<void> {
  await sql`delete from runs where started_at < now() - interval '60 days'`;
  await sql`update items set content = null where content is not null and status in ('skipped', 'failed')`;
}
