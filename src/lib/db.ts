import postgres from 'postgres';

// One small pool per warm function instance. `prepare: false` is required by
// Supabase's transaction pooler (port 6543).
const globalForSql = globalThis as unknown as { __sql?: postgres.Sql };

export const sql: postgres.Sql =
  globalForSql.__sql ??
  (globalForSql.__sql = postgres(process.env.DATABASE_URL ?? '', {
    prepare: false,
    max: Number(process.env.DB_POOL_MAX) || 4,
    idle_timeout: 20,
    connect_timeout: 10,
    onnotice: () => {},
    // Our bigint identity ids stay far below 2^53, so treat int8 as a plain number.
    types: {
      bigint: { to: 20, from: [20], serialize: (x: number) => String(x), parse: (x: string) => Number(x) },
    },
  }));

export type Source = {
  id: string;
  input_url: string;
  feed_url: string;
  site_url: string | null;
  title: string;
  kind: string;
  enabled: boolean;
  etag: string | null;
  last_modified: string | null;
  created_at: Date;
  last_fetched_at: Date | null;
  last_success_at: Date | null;
  last_error: string | null;
  consecutive_failures: number;
};

export type Item = {
  id: number;
  source_id: string | null;
  source_title: string;
  url: string;
  title: string;
  author: string | null;
  published_at: Date | null;
  fetched_at: Date;
  content: string | null;
  summary: string | null;
  topic: string | null;
  importance: number | null;
  status: 'pending' | 'done' | 'skipped' | 'failed';
  attempts: number;
  edition_id: number | null;
};

export type EditionLayout = {
  lead: number[];
  sections: { title: string; ids: number[] }[];
  briefly: number[];
};

export type Edition = {
  id: number;
  created_at: Date;
  headline: string | null;
  intro: string | null;
  layout: EditionLayout;
  item_count: number;
  source_count: number;
  model: string | null;
};

export type Run = {
  id: number;
  started_at: Date;
  finished_at: Date | null;
  trigger: string;
  status: 'running' | 'done' | 'error';
  stage: string | null;
  stats: Record<string, number | string>;
  error: string | null;
  edition_id: number | null;
};
