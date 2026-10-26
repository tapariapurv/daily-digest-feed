import { sql, type Source } from './db';

export type SourceView = Source & { recent_items: number };

export async function listSources(userId: string): Promise<SourceView[]> {
  const rows = await sql<SourceView[]>`
    select s.*, coalesce(c.n, 0)::int as recent_items
    from app.sources s
    left join (
      select source_id, count(*) as n from app.user_articles
      where user_id = ${userId} and status = 'done' and seen_at > now() - interval '30 days'
      group by source_id
    ) c on c.source_id = s.id
    where s.user_id = ${userId}
    order by s.title`;
  return JSON.parse(JSON.stringify(rows));
}

export const MAX_SOURCES_PER_USER = 80;
