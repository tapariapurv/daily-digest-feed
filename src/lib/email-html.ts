// Renders an edition as a newsletter email: table layout + inline styles so it
// looks right in Gmail, Apple Mail and Outlook.
import type { EditionLayout } from './db.ts';
import type { SummaryStyle } from './profile.ts';

export type EmailStory = {
  id: number;
  title: string;
  source: string;
  tldr: string | null;
  summary: string | null;
  key_points: string[] | null;
  image_url: string | null;
};

const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

export function renderEditionEmail(opts: {
  paperName: string;
  headline: string | null;
  intro: string | null;
  dateLabel: string;
  layout: EditionLayout;
  stories: Map<number, EmailStory>;
  accent: string;
  images: boolean;
  summaryStyle: SummaryStyle;
  siteUrl: string;
  editionId: number;
}): { html: string; text: string } {
  const { stories, layout, accent, siteUrl } = opts;
  const link = (id: number) => `${siteUrl}/r/${id}?e=${opts.editionId}`;
  const pick = (ids: number[]) => ids.map((id) => stories.get(Number(id))).filter((s): s is EmailStory => !!s);
  const serif = "Georgia, 'Times New Roman', serif";
  const mono = "'SFMono-Regular', Menlo, Consolas, monospace";

  const body = (s: EmailStory) => {
    if (opts.summaryStyle === 'headline') return '';
    const main = opts.summaryStyle === 'tldr' ? s.tldr ?? s.summary : s.summary ?? s.tldr;
    const points =
      opts.summaryStyle === 'detailed' && s.key_points?.length
        ? `<ul style="margin:8px 0 0;padding-left:18px;color:#3b3731;font:15px/1.5 ${serif}">${s.key_points.map((k) => `<li>${esc(k)}</li>`).join('')}</ul>`
        : '';
    return main ? `<p style="margin:6px 0 0;color:#3b3731;font:16px/1.55 ${serif}">${esc(main)}</p>${points}` : '';
  };

  const story = (s: EmailStory, big = false) => `
    <tr><td style="padding:18px 0;border-bottom:1px solid #e3dccd">
      ${opts.images && s.image_url && big ? `<a href="${link(s.id)}"><img src="${esc(s.image_url)}" alt="" width="560" style="display:block;width:100%;max-width:560px;height:auto;border-radius:6px;margin:0 0 12px"></a>` : ''}
      <div style="font:11px/1.4 ${mono};letter-spacing:.08em;text-transform:uppercase;color:#7a7266">${esc(s.source)}</div>
      <a href="${link(s.id)}" style="color:#1c1a17;text-decoration:none"><div style="font:${big ? '400 26px/1.15' : '700 19px/1.3'} ${serif};margin-top:4px">${esc(s.title)}</div></a>
      ${body(s)}
    </td></tr>`;

  const section = (title: string, items: EmailStory[], big = false) =>
    items.length
      ? `<tr><td style="padding:28px 0 4px;border-bottom:1px solid #1c1a17;font:400 22px/1.2 ${serif};color:#1c1a17">${esc(title)}</td></tr>${items.map((s) => story(s, big)).join('')}`
      : '';

  const lead = pick(layout.lead ?? []);
  const sections = (layout.sections ?? []).map((s) => ({ title: s.title, items: pick(s.ids) }));
  const briefly = pick(layout.briefly ?? []);

  const html = `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${esc(opts.paperName)}</title></head>
<body style="margin:0;padding:0;background:#f6f1e7">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f6f1e7"><tr><td align="center" style="padding:24px 12px">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:600px;background:#fbf8f1;border:1px solid #e3dccd;border-radius:10px">
<tr><td style="padding:28px 28px 8px">
  <div style="font:italic 18px ${serif};color:${accent}">${esc(opts.paperName)}</div>
  <div style="font:11px/1.4 ${mono};letter-spacing:.1em;text-transform:uppercase;color:#7a7266;margin-top:6px">${esc(opts.dateLabel)}</div>
  <div style="border-top:3px solid #1c1a17;border-bottom:1px solid #1c1a17;height:2px;margin:14px 0 18px"></div>
  <h1 style="margin:0 0 12px;font:400 34px/1.08 ${serif};color:#1c1a17">${esc(opts.headline ?? 'Here’s what’s new')}</h1>
  ${opts.intro ? `<p style="margin:0;font:17px/1.6 ${serif};color:#3b3731">${esc(opts.intro)}</p>` : ''}
</td></tr>
<tr><td style="padding:0 28px"><table role="presentation" width="100%" cellpadding="0" cellspacing="0">
  ${section('Don’t miss', lead, true)}
  ${sections.map((s) => section(s.title, s.items)).join('')}
  ${briefly.length ? `<tr><td style="padding:28px 0 4px;border-bottom:1px solid #1c1a17;font:400 22px/1.2 ${serif};color:#1c1a17">Briefly noted</td></tr>${briefly.map((s) => `<tr><td style="padding:10px 0;border-bottom:1px dotted #e3dccd;font:15px/1.4 ${serif}"><a href="${link(s.id)}" style="color:#1c1a17;text-decoration:none">${esc(s.title)}</a> <span style="font:10px ${mono};text-transform:uppercase;color:#7a7266">${esc(s.source)}</span></td></tr>`).join('')}` : ''}
</table></td></tr>
<tr><td style="padding:24px 28px 28px;text-align:center">
  <a href="${siteUrl}/e/${opts.editionId}" style="display:inline-block;background:#1c1a17;color:#f6f1e7;text-decoration:none;font:12px ${mono};letter-spacing:.08em;text-transform:uppercase;padding:12px 20px;border-radius:999px">Read on the web</a>
  <p style="font:12px/1.5 ${serif};color:#7a7266;margin:18px 0 0">You get this because email delivery is on in your <a href="${siteUrl}/settings" style="color:#7a7266">settings</a>.</p>
</td></tr>
</table></td></tr></table></body></html>`;

  const textStory = (s: EmailStory) => `• ${s.title} (${s.source})\n  ${s.tldr ?? s.summary ?? ''}\n  ${link(s.id)}`;
  const text = [
    opts.paperName,
    opts.dateLabel,
    '',
    opts.headline ?? '',
    opts.intro ?? '',
    '',
    ...lead.map(textStory),
    ...sections.flatMap((s) => ['', s.title.toUpperCase(), ...s.items.map(textStory)]),
    ...(briefly.length ? ['', 'BRIEFLY NOTED', ...briefly.map((s) => `• ${s.title} — ${link(s.id)}`)] : []),
    '',
    `Read on the web: ${siteUrl}/e/${opts.editionId}`,
  ].join('\n');
  return { html, text };
}
