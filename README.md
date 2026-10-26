# Morning Digest

Your morning paper, written from everything you follow. Anyone can sign up, add the blogs, newsletters, channels and sites they read, and get a calm, AI-summarised edition on their own schedule — on the web (phone, iPad, desktop) and by email.

Runs entirely on free tiers: **Vercel Hobby** (hosting), **Supabase Free** (Auth, Postgres, pg_cron scheduler), **Google AI Studio** (Gemini), **Gmail SMTP** (optional email delivery).

## Features

- **Accounts** — Supabase Auth (email + password, reset links). Each reader has their own sources, editions, design, schedule and history.
- **Add sources any way** — paste links, type names ("Stratechery", "Lenny's newsletter" — looked up with Gemini and verified), import OPML, or tap a starter pack. Feeds are discovered automatically; sites **without** a feed are scanned: Gemini picks the article links off the page and each article is read directly.
- **Email-only newsletters** — one click creates a private inbox (via kill-the-newsletter.com); issues sent there flow into the paper.
- **Summaries** — every article gets a one-line TL;DR, a 2–3 sentence summary, key points, a topic and a quality score. Summaries are **shared across readers**: an article is summarised once no matter how many people follow it, which keeps a single free Gemini key viable.
- **Per-reader editing** — a second AI pass ranks for the reader's stated interests, applies their length caps, writes a headline and editor's note, and groups stories into sections.
- **Design studio** — four templates (Broadsheet, Modern, Magazine, Wire), accent colours, light/dark/auto, text size, density, images on/off, with a live preview of your own latest edition.
- **Length** — Quick / Standard / Deep presets or custom (stories per edition, posts per source, headline / one line / summary / summary + key points).
- **Schedule** — up to three delivery times a day, chosen days, any time zone. Supabase pg_cron calls `/api/cron/tick` every 10 minutes; editions are printed shortly before they're due.
- **Email delivery** — newsletter-styled HTML email of each edition (when SMTP is configured).
- **Library** — read history (story links go through `/r/[id]`), saved stories, and every past edition, searchable.
- **No duplicates** — a per-reader ledger (`app.user_articles`) remembers everything seen.
- **Installable** — web app manifest; add to home screen on iOS/Android.

## Architecture

```
Supabase pg_cron (every 10 min) ─┐
Vercel Cron (daily backstop) ────┼─► /api/cron/tick ─► due readers ─► executeRun(reader)
"Refresh" / first open ──────────┘
executeRun: fetch feeds + scan feedless pages (Gemini picks links)
          → shared app.articles (dedupe by canonical URL)
          → reader ledger app.user_articles (no repeats)
          → read thin articles (Readability), Gemini pass 1 (shared summaries, ~20 per call)
          → Gemini pass 2 (reader's interests + length) → app.editions → optional email
```

All tables live in the private `app` schema (not exposed by Supabase's Data API). The server connects as a restricted `digest_app` role and scopes every query by the signed-in user's id from Supabase Auth. Schema: `supabase/migrations/`.

## Environment

See `.env.example`.

## Development

```bash
npm install
npm test          # unit tests (node:test)
npm run typecheck
npm run dev
```
