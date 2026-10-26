import { sql, type Edition, type Item } from './db.ts';

export type StoryItem = Pick<Item, 'id' | 'source_title' | 'url' | 'title' | 'author' | 'published_at' | 'fetched_at' | 'summary' | 'topic' | 'importance'>;

export type EditionView = {
  edition: Edition;
  number: number;
  items: Map<number, StoryItem>;
  prevId: number | null;
  nextId: number | null;
  readMinutes: number;
};

export async function getEditionView(id?: number): Promise<EditionView | null> {
  const [edition] = id
    ? await sql<Edition[]>`select * from editions where id = ${id}`
    : await sql<Edition[]>`select * from editions order by id desc limit 1`;
  if (!edition) return null;
  const [items, [prev], [next], [{ n }]] = await Promise.all([
    sql<StoryItem[]>`
      select id, source_title, url, title, author, published_at, fetched_at, summary, topic, importance
      from items where edition_id = ${edition.id}`,
    sql<{ id: number }[]>`select id from editions where id < ${edition.id} order by id desc limit 1`,
    sql<{ id: number }[]>`select id from editions where id > ${edition.id} order by id asc limit 1`,
    sql<{ n: number }[]>`select count(*)::int as n from editions where id <= ${edition.id}`,
  ]);
  const words = items.reduce((w, i) => w + `${i.title} ${i.summary ?? ''}`.split(/\s+/).length, 0) + (edition.intro?.split(/\s+/).length ?? 0);
  return {
    edition,
    number: n,
    items: new Map(items.map((i) => [Number(i.id), i])),
    prevId: prev ? Number(prev.id) : null,
    nextId: next ? Number(next.id) : null,
    readMinutes: Math.max(1, Math.round(words / 230)),
  };
}

export async function listEditions(limit = 120) {
  return sql<Pick<Edition, 'id' | 'created_at' | 'headline' | 'item_count' | 'source_count'>[]>`
    select id, created_at, headline, item_count, source_count from editions order by id desc limit ${limit}`;
}

export function timeAgo(date: Date | string | null): string {
  if (!date) return '';
  const diff = Date.now() - new Date(date).getTime();
  const m = Math.round(diff / 60_000);
  if (m < 1) return 'just now';
  if (m < 60) return `${m}m ago`;
  const h = Math.round(m / 60);
  if (h < 24) return `${h}h ago`;
  const d = Math.round(h / 24);
  if (d < 14) return `${d}d ago`;
  return new Date(date).toLocaleDateString('en', { month: 'short', day: 'numeric' });
}
