import { withUser } from '@/lib/api';
import { rows, type Source } from '@/lib/db';
import { sourcesOf } from '@/lib/sources';

const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

export const GET = withUser(async (user) => {
  const sources = rows<Source>(await sourcesOf(user.id).get()).filter((s) => s.kind !== 'page').sort((a, b) => a.title.localeCompare(b.title));
  const body = `<?xml version="1.0" encoding="UTF-8"?>
<opml version="2.0">
  <head><title>Morning Digest sources</title><dateCreated>${new Date().toUTCString()}</dateCreated></head>
  <body>
${sources.map((s) => `    <outline type="rss" text="${esc(s.title)}" title="${esc(s.title)}" xmlUrl="${esc(s.feed_url)}"${s.site_url ? ` htmlUrl="${esc(s.site_url)}"` : ''}/>`).join('\n')}
  </body>
</opml>
`;
  return new Response(body, {
    headers: { 'content-type': 'text/x-opml; charset=utf-8', 'content-disposition': 'attachment; filename="morning-digest-sources.opml"' },
  });
});
