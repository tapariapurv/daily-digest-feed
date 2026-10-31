import { rows, user, type LedgerEntry, type Source } from './db';

export type SourceView = Source & { recent_items: number };

export const sourcesOf = (userId: string) => user(userId).collection('sources');
export const ledgerOf = (userId: string) => user(userId).collection('ledger');

export async function listSources(userId: string): Promise<SourceView[]> {
  const [sources, recent] = await Promise.all([
    sourcesOf(userId).get().then((s) => rows<Source>(s)),
    ledgerOf(userId).where('seen_at', '>', new Date(Date.now() - 30 * 86400_000)).select('source_id', 'status').get().then((s) => rows<LedgerEntry>(s)),
  ]);
  const counts = new Map<string, number>();
  for (const r of recent) if (r.status === 'done' && r.source_id) counts.set(r.source_id, (counts.get(r.source_id) ?? 0) + 1);
  const out = sources.map((s) => ({ ...s, recent_items: counts.get(s.id) ?? 0 })).sort((a, b) => a.title.localeCompare(b.title));
  return JSON.parse(JSON.stringify(out));
}

/** Add a source unless this reader already follows that feed. Returns the new source, or null for a duplicate. */
export async function addSource(userId: string, s: Pick<Source, 'input_url' | 'feed_url' | 'site_url' | 'title' | 'kind'> & { inbox_email?: string | null }) {
  const dupe = await sourcesOf(userId).where('feed_url', '==', s.feed_url).limit(1).get();
  if (!dupe.empty) return null;
  const ref = sourcesOf(userId).doc();
  const source: Source = {
    id: ref.id, user_id: userId, enabled: true, inbox_email: null, etag: null, last_modified: null, created_at: new Date(),
    last_fetched_at: null, last_success_at: null, last_error: null, consecutive_failures: 0, ...s,
  };
  await ref.set(source);
  return source;
}

export const MAX_SOURCES_PER_USER = 80;
