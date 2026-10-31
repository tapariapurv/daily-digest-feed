import { articles, getMany, rows, user, type Article, type Edition, type EditionLayout, type LedgerEntry } from './db';
import { ledgerOf } from './sources';

export type StoryItem = {
  id: number;
  source_title: string;
  url: string;
  title: string;
  author: string | null;
  published_at: string | null;
  tldr: string | null;
  summary: string | null;
  key_points: string[] | null;
  image_url: string | null;
  topic: string | null;
};

export type EditionData = {
  edition: {
    id: number;
    created_at: string;
    headline: string | null;
    intro: string | null;
    layout: EditionLayout;
    item_count: number;
    source_count: number;
  };
  number: number;
  items: StoryItem[];
  prevId: number | null;
  nextId: number | null;
  readMinutes: number;
  readIds: number[];
  savedIds: number[];
};

export const editionsOf = (userId: string) => user(userId).collection('editions');

/** An edition's stories, with this reader's source titles. */
export async function editionStories(userId: string, editionId: number): Promise<(Article & { source_title: string })[]> {
  const ledger = rows<LedgerEntry>(await ledgerOf(userId).where('edition_id', '==', editionId).get());
  const titles = new Map(ledger.map((l) => [l.article_id, l.source_title]));
  const list = await getMany<Article>(articles(), ledger.map((l) => l.article_id));
  return list.map((a) => ({ ...a, source_title: titles.get(a.id) ?? a.source_title }));
}

export async function getEditionData(userId: string, id?: number): Promise<EditionData | null> {
  const col = editionsOf(userId);
  const snap = id ? await col.doc(String(id)).get() : (await col.orderBy('id', 'desc').limit(1).get()).docs[0];
  if (!snap?.exists) return null;
  const edition = rows<Edition>({ docs: [snap] })[0];
  const [stories, prev, next, count, reads, saved] = await Promise.all([
    editionStories(userId, edition.id),
    col.where('id', '<', edition.id).orderBy('id', 'desc').limit(1).get(),
    col.where('id', '>', edition.id).orderBy('id', 'asc').limit(1).get(),
    col.where('id', '<=', edition.id).count().get(),
    user(userId).collection('reads').where('edition_id', '==', edition.id).select().get(),
    user(userId).collection('saved').select().get(),
  ]);
  const ids = new Set(stories.map((s) => s.id));
  const items: StoryItem[] = stories.map((a) => ({
    id: a.id, source_title: a.source_title, url: a.url, title: a.title, author: a.author,
    published_at: a.published_at ? new Date(a.published_at).toISOString() : null,
    tldr: a.tldr, summary: a.summary, key_points: a.key_points, image_url: a.image_url, topic: a.topic,
  }));
  const words = items.reduce((w, i) => w + `${i.title} ${i.summary ?? ''}`.split(/\s+/).length, 0) + (edition.intro?.split(/\s+/).length ?? 0);
  return {
    edition: {
      id: edition.id, created_at: new Date(edition.created_at).toISOString(), headline: edition.headline, intro: edition.intro,
      layout: edition.layout, item_count: edition.item_count, source_count: edition.source_count,
    },
    number: count.data().count,
    items,
    prevId: prev.docs[0] ? Number(prev.docs[0].id) : null,
    nextId: next.docs[0] ? Number(next.docs[0].id) : null,
    readMinutes: Math.max(1, Math.round(words / 230)),
    readIds: reads.docs.map((d) => Number(d.id)),
    savedIds: saved.docs.map((d) => Number(d.id)).filter((n) => ids.has(n)),
  };
}

export async function listEditions(userId: string, limit = 200) {
  const list = rows<Edition>(await editionsOf(userId).orderBy('id', 'desc').limit(limit).get());
  return list.map(({ id, created_at, headline, item_count, source_count }) => ({ id, created_at, headline, item_count, source_count }));
}
