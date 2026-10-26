# Morning Digest

A personal morning newspaper built from the blogs, feeds, newsletters and channels you follow. Every morning it fetches what's new, summarises each piece in 2–3 sentences with Gemini, groups stories by topic, and lays them out as a calm, newsletter-style page. Stories you've already seen never come back.

Runs entirely on free tiers: **Vercel Hobby** (hosting + daily cron), **Supabase Free** (Postgres), **Google AI Studio** (Gemini free tier).

## How it works

```
Vercel Cron (daily, 00:00 UTC) ─┐
"Refresh" button / page open ───┼─► /api/run ─► fetch feeds ─► dedupe (unique key per story)
                                │               └─► read thin articles (Readability)
                                │               └─► Gemini pass 1: summary + topic + importance, ~20 articles per call
                                │               └─► Gemini pass 2: headline, editor's note, lead stories, sections
                                └─► Supabase Postgres (sources, items, editions, runs, settings)
```

- **Paste anything.** Homepages, feed URLs, Substack, Medium, Ghost, YouTube channels/playlists, subreddits, GitHub repos (releases). The feed is discovered automatically (`<link rel="alternate">`, well-known paths, site-specific rules). OPML import/export included.
- **Email-only newsletters:** create an inbox at [kill-the-newsletter.com](https://kill-the-newsletter.com) and paste its feed URL.
- **No duplicates:** every story gets a canonical key (URL without tracking params/`www`/fragment, or GUID). A unique index rejects anything seen before, across sources and days. A newly added source contributes only its latest 3 posts from the last 14 days.
- **Free-tier friendly:** batching keeps a typical day to a handful of Gemini calls. A model fallback chain (`gemini-3.5-flash → gemini-flash-lite-latest → …`) rides out overloads and rate limits. Anything not finished stays queued for the next run.
- **Ranking:** describe what you care about in Settings; it steers importance. Ads and housekeeping posts sink to "Briefly noted".
- **Private:** the whole site sits behind a passcode (signed, httpOnly cookie, one year). Changing the passcode signs out other devices. The database is reachable only by a restricted `digest_app` role; Supabase's public API exposes nothing (RLS on, no anon policies).

## Environment variables

See `.env.example`. On Vercel: `DATABASE_URL`, `GEMINI_API_KEY`, `APP_PASSCODE`, `AUTH_SECRET`, `CRON_SECRET` (optional `GEMINI_MODELS`).

## Development

```bash
npm install
npm test          # unit tests (node:test)
npm run typecheck
npm run dev
```

Database schema: `supabase/schema.sql`.
