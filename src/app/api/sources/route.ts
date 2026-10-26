import { denyUnlessAuthed, json, readJson } from '@/lib/api';
import { sql, type Source } from '@/lib/db';
import { resolveSource } from '@/lib/feeds';
import { listSources } from '@/lib/sources';
import { mapLimit } from '@/lib/text';

export const maxDuration = 120;

export async function GET() {
  const denied = await denyUnlessAuthed();
  if (denied) return denied;
  return json({ sources: await listSources() });
}

export type AddResult = { input: string; ok: boolean; duplicate?: boolean; title?: string; feedUrl?: string; error?: string };

export async function POST(request: Request) {
  const denied = await denyUnlessAuthed();
  if (denied) return denied;
  const { urls } = await readJson<{ urls: string[] }>(request);
  const inputs = [...new Set((Array.isArray(urls) ? urls : []).map((u) => String(u).trim()).filter(Boolean))].slice(0, 60);
  if (!inputs.length) return json({ error: 'Paste at least one link.' }, 400);

  const results = await mapLimit(inputs, 5, async (input): Promise<AddResult> => {
    try {
      const resolved = await resolveSource(input);
      const inserted = await sql<Source[]>`
        insert into sources (input_url, feed_url, site_url, title, kind)
        values (${input}, ${resolved.feedUrl}, ${resolved.siteUrl}, ${resolved.title.slice(0, 200)}, ${resolved.kind})
        on conflict (feed_url) do nothing returning *`;
      return { input, ok: true, duplicate: !inserted.length, title: resolved.title, feedUrl: resolved.feedUrl };
    } catch (err) {
      return { input, ok: false, error: err instanceof Error ? err.message : String(err) };
    }
  });
  return json({ results, sources: await listSources() });
}
