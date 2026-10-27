-- Newsletter issues from the reader's inbox keep their HTML so they can be read in-app.
alter table app.articles add column if not exists body_html text;
