import assert from 'node:assert/strict';
import { test } from 'node:test';
import { normaliseLayout } from '../src/lib/editor.ts';
import { findFeedLinks, knownFeedFor, normaliseInput, parseFeedText } from '../src/lib/feeds.ts';
import { canonicalUrl, chunk, dedupeKey, htmlToText, mapLimit } from '../src/lib/text.ts';

const RSS = `<?xml version="1.0"?>
<rss version="2.0" xmlns:content="http://purl.org/rss/1.0/modules/content/">
<channel><title>Example Blog</title><link>https://example.com/</link>
<item><title>First &amp; best</title><link>/posts/1?utm_source=rss</link><guid>p1</guid>
<pubDate>Mon, 26 Oct 2026 08:00:00 GMT</pubDate>
<content:encoded><![CDATA[<p>Hello <b>world</b>.</p><p>Second para.</p><script>bad()</script>]]></content:encoded></item>
<item><title>No date</title><link>https://example.com/posts/2</link><description>Short &lt;i&gt;teaser&lt;/i&gt;</description></item>
</channel></rss>`;

const ATOM = `<?xml version="1.0" encoding="utf-8"?>
<feed xmlns="http://www.w3.org/2005/Atom"><title>Atom Site</title><link href="https://atom.example/"/>
<entry><title>Atom post</title><link href="https://atom.example/a"/><id>tag:a</id><updated>2026-10-25T10:00:00Z</updated>
<author><name>Ada</name></author><summary>Summary text</summary></entry></feed>`;

const JSONFEED = JSON.stringify({
  version: 'https://jsonfeed.org/version/1.1',
  title: 'JSON Site',
  home_page_url: 'https://json.example',
  items: [{ id: '1', url: 'https://json.example/1', title: 'JSON post', content_html: '<p>Body</p>', date_published: '2026-10-24T00:00:00Z' }],
});

test('parses RSS with relative links, entities and HTML content', () => {
  const feed = parseFeedText(RSS, 'https://example.com/feed.xml');
  assert.equal(feed.title, 'Example Blog');
  assert.equal(feed.items.length, 2);
  const [a, b] = feed.items;
  assert.equal(a.title, 'First & best');
  assert.equal(a.url, 'https://example.com/posts/1?utm_source=rss');
  assert.match(a.content, /Hello world\.\s+Second para\./);
  assert.doesNotMatch(a.content, /bad\(\)/);
  assert.equal(a.published?.toISOString(), '2026-10-26T08:00:00.000Z');
  assert.equal(b.published, null);
  assert.equal(b.content, 'Short teaser');
});

test('parses Atom and JSON Feed', () => {
  const atom = parseFeedText(ATOM, 'https://atom.example/feed');
  assert.equal(atom.items[0].author, 'Ada');
  assert.equal(atom.items[0].url, 'https://atom.example/a');
  const json = parseFeedText(JSONFEED, 'https://json.example/feed.json');
  assert.equal(json.title, 'JSON Site');
  assert.equal(json.items[0].content, 'Body');
});

test('finds advertised feeds, preferring non-comment feeds', () => {
  const html = `<html><head>
    <link rel="alternate" type="application/rss+xml" title="Comments" href="/comments/feed/">
    <link rel="stylesheet" href="/s.css">
    <link type="application/atom+xml" rel="alternate" href="https://blog.example/atom.xml">
  </head></html>`;
  assert.deepEqual(findFeedLinks(html, 'https://blog.example/'), ['https://blog.example/atom.xml', 'https://blog.example/comments/feed/']);
});

test('maps well-known sites to their feeds', () => {
  assert.equal(knownFeedFor(new URL('https://www.youtube.com/channel/UCabc')), 'https://www.youtube.com/feeds/videos.xml?channel_id=UCabc');
  assert.equal(knownFeedFor(new URL('https://www.reddit.com/r/programming/')), 'https://www.reddit.com/r/programming/.rss');
  assert.equal(knownFeedFor(new URL('https://reddit.com/r/programming/top')), 'https://www.reddit.com/r/programming/top/.rss');
  assert.equal(knownFeedFor(new URL('https://medium.com/@someone')), 'https://medium.com/feed/@someone');
  assert.equal(knownFeedFor(new URL('https://name.substack.com/p/post')), 'https://name.substack.com/feed');
  assert.equal(knownFeedFor(new URL('https://github.com/vercel/next.js')), 'https://github.com/vercel/next.js/releases.atom');
  assert.equal(knownFeedFor(new URL('https://example.com/')), null);
});

test('normalises pasted input', () => {
  assert.equal(normaliseInput('example.com/blog').toString(), 'https://example.com/blog');
  assert.equal(normaliseInput('feed://example.com/rss').toString(), 'https://example.com/rss');
  assert.throws(() => normaliseInput('not a url'));
});

test('canonical URLs ignore tracking, www, hash and trailing slash', () => {
  assert.equal(canonicalUrl('https://www.Example.com/a/?utm_source=x&b=2&a=1#frag'), 'example.com/a?a=1&b=2');
  assert.equal(canonicalUrl('https://example.com/a'), 'example.com/a');
  assert.equal(
    dedupeKey({ url: 'https://example.com/a?utm_medium=rss', fallback: 'x' }),
    dedupeKey({ url: 'http://www.example.com/a/', fallback: 'y' }),
  );
  assert.notEqual(dedupeKey({ url: null, guid: 'g1', fallback: 'x' }), dedupeKey({ url: null, guid: 'g2', fallback: 'x' }));
});

test('htmlToText decodes entities and keeps paragraphs', () => {
  assert.equal(htmlToText('<p>A &amp; B</p><p>C&nbsp;D</p>'), 'A & B\n\nC D');
  assert.equal(htmlToText('plain'), 'plain');
});

test('normaliseLayout keeps every story at most once and respects caps', () => {
  const items = [1, 2, 3, 4, 5, 6].map((id) => ({ id, title: `t${id}`, source: 's', topic: id < 3 ? 'AI' : 'Money', quality: id === 6 ? 1 : id, tldr: '', published: null }));
  const layout = normaliseLayout(items, { lead: [5, 5, 99], sections: [{ title: 'AI', ids: [1, 5, 1] }, { title: 'Empty', ids: [42] }], briefly: [6] }, { maxStories: 4, briefly: true });
  const main = [...layout.lead, ...layout.sections.flatMap((s) => s.ids)];
  assert.equal(main.length, 4, 'fills up to the cap with the best remaining stories');
  assert.equal(new Set([...main, ...layout.briefly]).size, main.length + layout.briefly.length);
  assert.deepEqual(layout.lead, [5]);
  assert.ok(!layout.sections.some((s) => s.title === 'Empty'));
  assert.deepEqual(layout.briefly, [6]);
  // A model failure (empty draft) still produces a usable, capped layout with a lead story.
  const fallback = normaliseLayout(items, {}, { maxStories: 3, briefly: false });
  assert.deepEqual(fallback.lead, [5]);
  assert.equal(fallback.sections.flatMap((s) => s.ids).length, 2);
  assert.deepEqual(fallback.briefly, []);
});

test('mapLimit preserves order and bounds concurrency', async () => {
  let inFlight = 0;
  let peak = 0;
  const out = await mapLimit([1, 2, 3, 4, 5, 6], 2, async (n) => {
    peak = Math.max(peak, ++inFlight);
    await new Promise((r) => setTimeout(r, 5));
    inFlight--;
    return n * 2;
  });
  assert.deepEqual(out, [2, 4, 6, 8, 10, 12]);
  assert.equal(peak, 2);
  assert.deepEqual(chunk([1, 2, 3], 2), [[1, 2], [3]]);
});

test('YouTube handles resolve to the page’s own channel, not related ones', () => {
  const html = `<html><head>
    <link rel="alternate" type="application/rss+xml" title="RSS" href="https://www.youtube.com/feeds/videos.xml?channel_id=UCin0m13qWv3-051xlWlHamA">
    <link rel="canonical" href="https://www.youtube.com/channel/UCHnyfMqiRRG1u-2MsSQLbXA">
  </head></html>`;
  assert.deepEqual(findFeedLinks(html, 'https://www.youtube.com/@veritasium'), [
    'https://www.youtube.com/feeds/videos.xml?channel_id=UCHnyfMqiRRG1u-2MsSQLbXA',
  ]);
});

test('Reddit link posts use the linked article, self posts keep the thread', () => {
  const atom = `<?xml version="1.0"?><feed xmlns="http://www.w3.org/2005/Atom"><title>programming</title>
  <entry><id>t3_a</id><title>CI from 27 to 4 minutes</title><link href="https://www.reddit.com/r/programming/comments/a/ci/"/>
  <content type="html">&lt;a href=&quot;https://blog.example/ci?x=1&amp;amp;y=2&quot;&gt;[link]&lt;/a&gt; &lt;a href=&quot;https://www.reddit.com/r/programming/comments/a/ci/&quot;&gt;[comments]&lt;/a&gt;</content></entry>
  <entry><id>t3_b</id><title>Ask: tabs or spaces?</title><link href="https://www.reddit.com/r/programming/comments/b/ask/"/>
  <content type="html">&lt;a href=&quot;https://www.reddit.com/r/programming/comments/b/ask/&quot;&gt;[link]&lt;/a&gt;</content></entry></feed>`;
  const feed = parseFeedText(atom, 'https://www.reddit.com/r/programming/.rss');
  assert.equal(feed.items[0].url, 'https://blog.example/ci?x=1&y=2');
  assert.equal(feed.items[1].url, 'https://www.reddit.com/r/programming/comments/b/ask/');
});

test('Hacker News maps to the hnrss mirror', () => {
  assert.equal(knownFeedFor(new URL('https://news.ycombinator.com/')), 'https://hnrss.org/frontpage?points=150');
});
