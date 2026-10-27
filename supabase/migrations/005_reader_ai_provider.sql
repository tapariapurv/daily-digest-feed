-- Last problem seen with a reader's own Gemini key (null when it works).
alter table app.profiles add column if not exists gemini_key_error text;

-- Reader's AI provider choice: { provider, model, baseUrl }. The key itself stays encrypted in gemini_key_enc.
alter table app.profiles add column if not exists ai jsonb not null default '{}'::jsonb;
