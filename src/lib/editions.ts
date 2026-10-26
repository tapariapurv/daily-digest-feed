import { sql, type EditionLayout } from './db';

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

export async function getEditionData(userId: string, id?: number): Promise<EditionData | null> {
  const [edition] = id
    ? await sql<EditionData['edition'][]>`
        select id, created_at, headline, intro, layout, item_count, source_count from app.editions where id = ${id} and user_id = ${userId}`
    : await sql<EditionData['edition'][]>`
        select id, created_at, headline, intro, layout, item_count, source_count from app.editions where user_id = ${userId} order by id desc limit 1`;
  if (!edition) return null;
  const [items, [prev], [next], [{ n }], reads, saved] = await Promise.all([
    sql<StoryItem[]>`
      select a.id, ua.source_title, a.url, a.title, a.author, a.published_at, a.tldr, a.summary, a.key_points, a.image_url, a.topic
      from app.user_articles ua join app.articles a on a.id = ua.article_id
      where ua.user_id = ${userId} and ua.edition_id = ${edition.id}`,
    sql<{ id: number }[]>`select id from app.editions where user_id = ${userId} and id < ${edition.id} order by id desc limit 1`,
    sql<{ id: number }[]>`select id from app.editions where user_id = ${userId} and id > ${edition.id} order by id asc limit 1`,
    sql<{ n: number }[]>`select count(*)::int as n from app.editions where user_id = ${userId} and id <= ${edition.id}`,
    sql<{ article_id: number }[]>`
      select r.article_id from app.reads r join app.user_articles ua on ua.article_id = r.article_id and ua.user_id = r.user_id
      where r.user_id = ${userId} and ua.edition_id = ${edition.id}`,
    sql<{ article_id: number }[]>`
      select s.article_id from app.saved s join app.user_articles ua on ua.article_id = s.article_id and ua.user_id = s.user_id
      where s.user_id = ${userId} and ua.edition_id = ${edition.id}`,
  ]);
  const words =
    items.reduce((w, i) => w + `${i.title} ${i.summary ?? ''}`.split(/\s+/).length, 0) + (edition.intro?.split(/\s+/).length ?? 0);
  return {
    edition: { ...edition, created_at: new Date(edition.created_at).toISOString() },
    number: n,
    items: items.map((i) => ({ ...i, published_at: i.published_at ? new Date(i.published_at).toISOString() : null })),
    prevId: prev?.id ?? null,
    nextId: next?.id ?? null,
    readMinutes: Math.max(1, Math.round(words / 230)),
    readIds: reads.map((r) => r.article_id),
    savedIds: saved.map((r) => r.article_id),
  };
}

export async function listEditions(userId: string, limit = 200) {
  return sql<{ id: number; created_at: Date; headline: string | null; item_count: number; source_count: number }[]>`
    select id, created_at, headline, item_count, source_count from app.editions where user_id = ${userId} order by id desc limit ${limit}`;
}
