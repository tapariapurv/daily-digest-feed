import { sql, type Source } from './db.ts';

export type SourceView = Source & { recent_items: number };

export async function listSources(): Promise<SourceView[]> {
  return sql<SourceView[]>`
    select s.*, coalesce(c.n, 0)::int as recent_items
    from sources s
    left join (
      select source_id, count(*) as n from items
      where status = 'done' and fetched_at > now() - interval '30 days'
      group by source_id
    ) c on c.source_id = s.id
    order by s.title`;
}
