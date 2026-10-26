import { denyUnlessAuthed, json, readJson } from '@/lib/api';
import { sql } from '@/lib/db';
import { resolveSource } from '@/lib/feeds';
import { listSources } from '@/lib/sources';

export const maxDuration = 60;

type Patch = { url: string; title: string; enabled: boolean };

export async function PATCH(request: Request, ctx: RouteContext<'/api/sources/[id]'>) {
  const denied = await denyUnlessAuthed();
  if (denied) return denied;
  const { id } = await ctx.params;
  const body = await readJson<Patch>(request);

  if (typeof body.url === 'string' && body.url.trim()) {
    let resolved;
    try {
      resolved = await resolveSource(body.url);
    } catch (err) {
      return json({ error: err instanceof Error ? err.message : String(err) }, 422);
    }
    const clash = await sql`select 1 from sources where feed_url = ${resolved.feedUrl} and id <> ${id}`;
    if (clash.length) return json({ error: 'You already follow that feed.' }, 409);
    // A changed feed is treated as new: the first fetch takes only its latest few posts.
    await sql`
      update sources set input_url = ${body.url.trim()}, feed_url = ${resolved.feedUrl}, site_url = ${resolved.siteUrl},
        kind = ${resolved.kind}, title = ${typeof body.title === 'string' && body.title.trim() ? body.title.trim().slice(0, 200) : resolved.title.slice(0, 200)},
        etag = null, last_modified = null, last_success_at = null, last_error = null, consecutive_failures = 0
      where id = ${id}`;
  } else if (typeof body.title === 'string' && body.title.trim()) {
    await sql`update sources set title = ${body.title.trim().slice(0, 200)} where id = ${id}`;
  }
  if (typeof body.enabled === 'boolean') {
    await sql`update sources set enabled = ${body.enabled} where id = ${id}`;
  }
  return json({ sources: await listSources() });
}

export async function DELETE(_request: Request, ctx: RouteContext<'/api/sources/[id]'>) {
  const denied = await denyUnlessAuthed();
  if (denied) return denied;
  const { id } = await ctx.params;
  // Items keep their source_title, so past editions stay intact.
  await sql`delete from sources where id = ${id}`;
  return json({ sources: await listSources() });
}
