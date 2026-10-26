import nodemailer from 'nodemailer';
import { sql, type EditionLayout } from './db.ts';
import { renderEditionEmail, type EmailStory } from './email-html.ts';
import { normaliseDesign, normaliseReading, normaliseSchedule, TEMPLATES } from './profile.ts';

export function mailConfigured(): boolean {
  return !!(process.env.SMTP_USER && process.env.SMTP_PASS);
}

export function siteUrl(): string {
  const url = process.env.SITE_URL ?? (process.env.VERCEL_PROJECT_PRODUCTION_URL ? `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}` : 'http://localhost:3000');
  return url.replace(/\/$/, '');
}

function transport() {
  const port = Number(process.env.SMTP_PORT ?? 465);
  return nodemailer.createTransport({
    host: process.env.SMTP_HOST ?? 'smtp.gmail.com',
    port,
    secure: port === 465,
    auth: { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS },
  });
}

/** Email one edition to its reader. Returns false when email isn't configured. */
export async function sendEditionEmail(userId: string, editionId: number): Promise<boolean> {
  if (!mailConfigured()) return false;
  const [profile] = await sql<{ email: string | null; paper_name: string; design: object; reading: object; schedule: object }[]>`
    select email, paper_name, design, reading, schedule from app.profiles where user_id = ${userId}`;
  const [edition] = await sql<{ id: number; headline: string | null; intro: string | null; layout: EditionLayout; created_at: Date }[]>`
    select id, headline, intro, layout, created_at from app.editions where id = ${editionId} and user_id = ${userId}`;
  if (!profile?.email || !edition) return false;
  const rows = await sql<(EmailStory & { source_title: string })[]>`
    select a.id, a.title, ua.source_title as source, a.tldr, a.summary, a.key_points, a.image_url
    from app.user_articles ua join app.articles a on a.id = ua.article_id
    where ua.edition_id = ${editionId} and ua.user_id = ${userId}`;
  const design = normaliseDesign(profile.design);
  const tz = normaliseSchedule(profile.schedule).timezone;
  const dateLabel = new Date(edition.created_at).toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric', timeZone: tz });
  const { html, text } = renderEditionEmail({
    paperName: profile.paper_name,
    headline: edition.headline,
    intro: edition.intro,
    dateLabel,
    layout: edition.layout,
    stories: new Map(rows.map((r) => [Number(r.id), r])),
    accent: design.accent ?? TEMPLATES.find((t) => t.id === design.template)!.accent,
    images: design.images,
    summaryStyle: normaliseReading(profile.reading).summaryStyle,
    siteUrl: siteUrl(),
    editionId,
  });
  await transport().sendMail({
    from: { name: profile.paper_name, address: process.env.SMTP_FROM ?? process.env.SMTP_USER! },
    to: profile.email,
    subject: `${profile.paper_name} — ${edition.headline ?? dateLabel}`,
    html,
    text,
  });
  return true;
}
