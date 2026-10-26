import assert from 'node:assert/strict';
import { test } from 'node:test';
import { renderEditionEmail } from '../src/lib/email-html.ts';
import { firstImage, parseFeedText } from '../src/lib/feeds.ts';
import { normaliseDesign, normaliseReading, normaliseSchedule } from '../src/lib/profile.ts';
import { nextRunAfter, zonedTimeToUtc } from '../src/lib/schedule.ts';
import { extractLinks, heuristicArticleLinks, pageTitle } from '../src/lib/scrape.ts';

test('zonedTimeToUtc handles fixed offsets and DST', () => {
  assert.equal(zonedTimeToUtc(2026, 9, 26, 7, 0, 'Asia/Kolkata').toISOString(), '2026-10-26T01:30:00.000Z');
  // New York: EDT (UTC-4) in October, EST (UTC-5) in December.
  assert.equal(zonedTimeToUtc(2026, 9, 26, 7, 0, 'America/New_York').toISOString(), '2026-10-26T11:00:00.000Z');
  assert.equal(zonedTimeToUtc(2026, 11, 1, 7, 0, 'America/New_York').toISOString(), '2026-12-01T12:00:00.000Z');
});

test('nextRunAfter picks the next time on an allowed day', () => {
  const s = normaliseSchedule({ enabled: true, times: ['07:00', '18:30'], days: [1, 2, 3, 4, 5], timezone: 'Asia/Kolkata' });
  // Monday 2026-10-26 08:00 IST → same day 18:30 IST
  assert.equal(nextRunAfter(s, new Date('2026-10-26T02:30:00Z'))?.toISOString(), '2026-10-26T13:00:00.000Z');
  // Friday 2026-10-30 19:00 IST → Monday 07:00 IST (skips the weekend)
  assert.equal(nextRunAfter(s, new Date('2026-10-30T13:30:00Z'))?.toISOString(), '2026-11-02T01:30:00.000Z');
  assert.equal(nextRunAfter({ ...s, enabled: false }), null);
});

test('settings are validated and clamped', () => {
  assert.deepEqual(normaliseDesign({ template: 'nope' as never, accent: 'red', textSize: 'xl' as never }).template, 'broadsheet');
  assert.equal(normaliseDesign({ accent: 'red' }).accent, null);
  assert.equal(normaliseDesign({ accent: '#123abc' }).accent, '#123abc');
  const r = normaliseReading({ preset: 'custom', maxStories: 999, perSource: 0, summaryStyle: 'detailed' });
  assert.equal(r.maxStories, 60);
  assert.equal(r.perSource, 1);
  assert.equal(normaliseReading({ preset: 'quick', maxStories: 50 }).maxStories, 8, 'presets override custom numbers');
  const s = normaliseSchedule({ times: ['25:00', '07:00', '07:00', '06:15'], days: [9, 1], timezone: 'Mars/Base' });
  assert.deepEqual(s.times, ['06:15', '07:00']);
  assert.deepEqual(s.days, [1]);
  assert.equal(s.timezone, 'UTC');
});

test('page scanning finds article links and ignores navigation', () => {
  const html = `<html><head><title>Acme Blog | Acme</title></head><body>
    <nav><a href="/about">About us</a><a href="/blog/how-we-scaled-postgres-to-1m-users">Nav dup</a></nav>
    <a href="/">Home</a><a href="/tag/postgres">Postgres</a><a href="https://other.com/x-y-z">Elsewhere entirely here</a>
    <a href="/blog/how-we-scaled-postgres-to-1m-users">How we scaled Postgres to a million users</a>
    <a href="/2026/10/notes-on-pricing">Notes on pricing our product</a>
    <a href="/careers">We are hiring engineers now</a>
    <a href="/blog/how-we-scaled-postgres-to-1m-users#comments">12 comments</a>
  </body></html>`;
  const links = extractLinks(html, 'https://acme.dev/blog');
  assert.deepEqual(
    links.map((l) => l.url),
    ['https://acme.dev/blog/how-we-scaled-postgres-to-1m-users', 'https://acme.dev/2026/10/notes-on-pricing'],
  );
  assert.equal(links[0].text, 'How we scaled Postgres to a million users');
  assert.equal(heuristicArticleLinks(links).length, 2);
  assert.equal(pageTitle(html, 'https://acme.dev'), 'Acme Blog');
});

test('feed images come from media, enclosures, YouTube ids or content', () => {
  assert.equal(firstImage('<p><img src="/t.gif" width="1"><img src="/hero.jpg"></p>', 'https://x.com/a'), 'https://x.com/hero.jpg');
  assert.equal(firstImage('<img src="https://feeds.feedburner.com/~r/x/~4/pixel">', 'https://x.com'), null);
  const yt = parseFeedText(
    `<?xml version="1.0"?><feed xmlns="http://www.w3.org/2005/Atom"><title>Chan</title><entry><id>yt:video:abc</id><title>Video</title><link href="https://www.youtube.com/watch?v=dQw4w9WgXcQ"/></entry></feed>`,
    'https://www.youtube.com/feeds/videos.xml?channel_id=UC1',
  );
  assert.equal(yt.items[0].image, 'https://i.ytimg.com/vi/dQw4w9WgXcQ/hqdefault.jpg');
});

test('edition email escapes content and links through the read tracker', () => {
  const { html, text } = renderEditionEmail({
    paperName: 'The <Daily>',
    headline: 'Big & small',
    intro: 'Intro',
    dateLabel: 'Monday',
    layout: { lead: [1], sections: [{ title: 'More', ids: [2] }], briefly: [] },
    stories: new Map([
      [1, { id: 1, title: 'A <b>bold</b> claim', source: 'Src', tldr: 't', summary: 's', key_points: ['k'], image_url: 'https://img/x.jpg' }],
      [2, { id: 2, title: 'Two', source: 'Src', tldr: 't2', summary: null, key_points: null, image_url: null }],
    ]),
    accent: '#a23b1e',
    images: false,
    summaryStyle: 'detailed',
    siteUrl: 'https://paper.example',
    editionId: 7,
  });
  assert.match(html, /The &lt;Daily&gt;/);
  assert.match(html, /A &lt;b&gt;bold&lt;\/b&gt; claim/);
  assert.match(html, /https:\/\/paper\.example\/r\/1\?e=7/);
  assert.doesNotMatch(html, /img\/x\.jpg/, 'images off means no images');
  assert.match(html, /<li>k<\/li>/);
  assert.match(text, /Read on the web: https:\/\/paper\.example\/e\/7/);
});
