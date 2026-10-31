import { data } from './db.ts';
import { mailboxConfigured, mailOut } from './mailbox.ts';
import { editionsOf, editionStories } from './editions.ts';
import { getProfileRow } from './profiles.ts';
import type { Edition } from './db.ts';
import { renderEditionEmail, type EmailStory } from './email-html.ts';
import { normaliseDesign, normaliseReading, normaliseSchedule, TEMPLATES } from './profile.ts';

export const mailConfigured = mailboxConfigured;

export function siteUrl(): string {
  const url = process.env.SITE_URL ?? (process.env.VERCEL_PROJECT_PRODUCTION_URL ? `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}` : 'http://localhost:3000');
  return url.replace(/\/$/, '');
}

/** Queue one edition for its reader; the Apps Script sends it from Gmail within 10 minutes. Returns false when email isn't configured. */
export async function sendEditionEmail(userId: string, editionId: number): Promise<boolean> {
  if (!mailConfigured()) return false;
  const profile = await getProfileRow(userId);
  const snap = await editionsOf(userId).doc(String(editionId)).get();
  if (!profile?.email || !snap.exists) return false;
  const edition = data<Edition>(snap);
  const rows: EmailStory[] = (await editionStories(userId, editionId)).map((a) => ({
    id: a.id, title: a.title, source: a.source_title, tldr: a.tldr, summary: a.summary, key_points: a.key_points, image_url: a.image_url,
  }));
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
  await mailOut().add({
    to: profile.email,
    name: profile.paper_name,
    subject: `${profile.paper_name} — ${edition.headline ?? dateLabel}`,
    html,
    text,
    created_at: new Date(),
  });
  return true;
}
