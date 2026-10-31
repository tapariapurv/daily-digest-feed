import { json, readJson, withUser } from '@/lib/api';
import { resolveSource } from '@/lib/feeds';
import { listSources, sourcesOf } from '@/lib/sources';

export const maxDuration = 60;

type Ctx = { params: Promise<{ id: string }> };
type Patch = { url: string; title: string; enabled: boolean };

export const PATCH = withUser<Ctx>(async (user, request, ctx) => {
  const { id } = await ctx.params;
  const body = await readJson<Patch>(request);
  const ref = sourcesOf(user.id).doc(id);
  if (!(await ref.get()).exists) return json({ error: 'Not found' }, 404);

  if (typeof body.url === 'string' && body.url.trim()) {
    let resolved;
    try {
      resolved = await resolveSource(body.url);
    } catch (err) {
      return json({ error: err instanceof Error ? err.message : String(err) }, 422);
    }
    const clash = (await sourcesOf(user.id).where('feed_url', '==', resolved.feedUrl).get()).docs.some((d) => d.id !== id);
    if (clash) return json({ error: 'You already follow that feed.' }, 409);
    const title = typeof body.title === 'string' && body.title.trim() ? body.title.trim() : resolved.title;
    // A changed source is treated as new: the first fetch takes only its latest few posts.
    await ref.update({
      input_url: body.url.trim(), feed_url: resolved.feedUrl, site_url: resolved.siteUrl, kind: resolved.kind, title: title.slice(0, 200),
      etag: null, last_modified: null, last_success_at: null, last_error: null, consecutive_failures: 0,
    });
  } else if (typeof body.title === 'string' && body.title.trim()) {
    await ref.update({ title: body.title.trim().slice(0, 200) });
  }
  if (typeof body.enabled === 'boolean') {
    await ref.update({ enabled: body.enabled });
  }
  return json({ sources: await listSources(user.id) });
});

export const DELETE = withUser<Ctx>(async (user, _request, ctx) => {
  const { id } = await ctx.params;
  // The ledger keeps source_title, so past editions stay intact.
  const ref = sourcesOf(user.id).doc(id);
  if (!(await ref.get()).exists) return json({ error: 'Not found' }, 404);
  await ref.delete();
  return json({ sources: await listSources(user.id) });
});
