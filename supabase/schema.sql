-- Morning Digest schema. Applied via Supabase migration "init_schema".
-- The app connects as a dedicated login role (digest_app) through the pooler;
-- RLS is enabled everywhere with no anon/authenticated policies, so the public
-- Supabase REST API exposes nothing.

create extension if not exists pgcrypto;

create table public.sources (
  id uuid primary key default gen_random_uuid(),
  input_url text not null,
  feed_url text not null unique,
  site_url text,
  title text not null,
  kind text not null default 'feed',
  enabled boolean not null default true,
  etag text,
  last_modified text,
  created_at timestamptz not null default now(),
  last_fetched_at timestamptz,
  last_success_at timestamptz,
  last_error text,
  consecutive_failures int not null default 0
);

create table public.editions (
  id bigint generated always as identity primary key,
  created_at timestamptz not null default now(),
  headline text,
  intro text,
  layout jsonb not null default '{}'::jsonb,
  item_count int not null default 0,
  source_count int not null default 0,
  model text
);

create table public.items (
  id bigint generated always as identity primary key,
  source_id uuid references public.sources(id) on delete set null,
  source_title text not null,
  dedupe_key text not null unique,
  url text not null,
  title text not null,
  author text,
  published_at timestamptz,
  fetched_at timestamptz not null default now(),
  content text,
  summary text,
  topic text,
  importance smallint,
  status text not null default 'pending' check (status in ('pending','done','skipped','failed')),
  attempts smallint not null default 0,
  edition_id bigint references public.editions(id) on delete set null
);
create index items_status_idx on public.items (status) where status = 'pending';
create index items_edition_idx on public.items (edition_id);

create table public.runs (
  id bigint generated always as identity primary key,
  started_at timestamptz not null default now(),
  finished_at timestamptz,
  trigger text not null,
  status text not null default 'running' check (status in ('running','done','error')),
  stage text,
  stats jsonb not null default '{}'::jsonb,
  error text,
  edition_id bigint references public.editions(id) on delete set null
);
create index runs_started_idx on public.runs (started_at desc);

create table public.settings (
  key text primary key,
  value jsonb not null,
  updated_at timestamptz not null default now()
);

alter table public.sources enable row level security;
alter table public.editions enable row level security;
alter table public.items enable row level security;
alter table public.runs enable row level security;
alter table public.settings enable row level security;

-- App role (run separately; set your own password):
-- create role digest_app with login password '<password>' noinherit;
-- grant usage on schema public to digest_app;
-- grant select, insert, update, delete on public.sources, public.editions, public.items, public.runs, public.settings to digest_app;
-- grant usage, select on all sequences in schema public to digest_app;
-- create policy app_all on public.<each table> for all to digest_app using (true) with check (true);

-- Migration "single_running_run": at most one run in progress at a time.
create unique index runs_one_running_idx on public.runs ((true)) where status = 'running';
