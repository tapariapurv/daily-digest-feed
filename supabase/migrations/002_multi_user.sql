-- Multi-user Morning Digest. Everything lives in the private `app` schema, which the
-- Supabase Data API does not expose. The Next.js server connects as `digest_app`
-- and scopes every query by the signed-in user's id (from Supabase Auth).

create schema if not exists app;
revoke all on schema app from public, anon, authenticated;
grant usage on schema app to digest_app;

create table app.profiles (
  user_id uuid primary key references auth.users(id) on delete cascade,
  email text,
  paper_name text not null default 'The Morning Digest',
  interests text not null default '',
  design jsonb not null default '{}'::jsonb,
  reading jsonb not null default '{}'::jsonb,
  schedule jsonb not null default '{}'::jsonb,
  email_delivery boolean not null default false,
  gemini_key_enc text,
  onboarded boolean not null default false,
  next_run_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index profiles_next_run_idx on app.profiles (next_run_at) where next_run_at is not null;

create table app.sources (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references app.profiles(user_id) on delete cascade,
  input_url text not null,
  feed_url text not null,
  site_url text,
  title text not null,
  kind text not null default 'feed',
  enabled boolean not null default true,
  inbox_email text,
  etag text,
  last_modified text,
  created_at timestamptz not null default now(),
  last_fetched_at timestamptz,
  last_success_at timestamptz,
  last_error text,
  consecutive_failures int not null default 0,
  unique (user_id, feed_url)
);
create index sources_user_idx on app.sources (user_id);

-- Shared across users: an article is fetched, read and summarised once.
create table app.articles (
  id bigint generated always as identity primary key,
  dedupe_key text not null unique,
  url text not null,
  title text not null,
  author text,
  source_title text not null,
  published_at timestamptz,
  image_url text,
  content text,
  tldr text,
  summary text,
  key_points jsonb,
  topic text,
  quality smallint,
  summarized_at timestamptz,
  summary_attempts smallint not null default 0,
  created_at timestamptz not null default now()
);

create table app.editions (
  id bigint generated always as identity primary key,
  user_id uuid not null references app.profiles(user_id) on delete cascade,
  created_at timestamptz not null default now(),
  headline text,
  intro text,
  layout jsonb not null default '{}'::jsonb,
  item_count int not null default 0,
  source_count int not null default 0,
  model text,
  trigger text,
  emailed_at timestamptz
);
create index editions_user_idx on app.editions (user_id, id desc);

-- Per-user "seen" ledger: the no-duplicates guarantee.
create table app.user_articles (
  user_id uuid not null references app.profiles(user_id) on delete cascade,
  article_id bigint not null references app.articles(id) on delete cascade,
  source_id uuid references app.sources(id) on delete set null,
  source_title text not null,
  status text not null default 'pending' check (status in ('pending', 'done', 'skipped', 'failed')),
  edition_id bigint references app.editions(id) on delete set null,
  seen_at timestamptz not null default now(),
  primary key (user_id, article_id)
);
create index user_articles_pending_idx on app.user_articles (user_id) where status = 'pending';
create index user_articles_edition_idx on app.user_articles (edition_id);

create table app.reads (
  user_id uuid not null references app.profiles(user_id) on delete cascade,
  article_id bigint not null references app.articles(id) on delete cascade,
  edition_id bigint references app.editions(id) on delete set null,
  read_at timestamptz not null default now(),
  primary key (user_id, article_id)
);
create index reads_user_idx on app.reads (user_id, read_at desc);

create table app.saved (
  user_id uuid not null references app.profiles(user_id) on delete cascade,
  article_id bigint not null references app.articles(id) on delete cascade,
  saved_at timestamptz not null default now(),
  primary key (user_id, article_id)
);

create table app.runs (
  id bigint generated always as identity primary key,
  user_id uuid not null references app.profiles(user_id) on delete cascade,
  started_at timestamptz not null default now(),
  finished_at timestamptz,
  trigger text not null,
  status text not null default 'running' check (status in ('running', 'done', 'error')),
  stage text,
  stats jsonb not null default '{}'::jsonb,
  error text,
  edition_id bigint references app.editions(id) on delete set null
);
create unique index runs_one_running_per_user_idx on app.runs (user_id) where status = 'running';
create index runs_user_idx on app.runs (user_id, started_at desc);

do $$
declare t text;
begin
  foreach t in array array['profiles','sources','articles','editions','user_articles','reads','saved','runs'] loop
    execute format('alter table app.%I enable row level security', t);
    execute format('create policy app_server on app.%I for all to digest_app using (true) with check (true)', t);
    execute format('grant select, insert, update, delete on app.%I to digest_app', t);
  end loop;
end $$;
grant usage, select on all sequences in schema app to digest_app;
