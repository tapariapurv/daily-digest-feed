import { json, readJson, withUser } from '@/lib/api';
import { decryptSecret } from '@/lib/crypto';
import { sql, type Source } from '@/lib/db';
import { resolveSource } from '@/lib/feeds';
import { lookupSourceUrls } from '@/lib/lookup';
import { refreshNextRun } from '@/lib/profiles';
import { listSources, MAX_SOURCES_PER_USER } from '@/lib/sources';
import { mapLimit } from '@/lib/text';

export const maxDuration = 120;

export const GET = withUser(async (user) => json({ sources: await listSources(user.id) }));

export type AddResult = { input: string; ok: boolean; duplicate?: boolean; title?: string; feedUrl?: string; kind?: string; via?: string; error?: string };

const looksLikeUrl = (s: string) => /^(https?:\/\/|feed:)/i.test(s) || /^[\w-]+(\.[\w-]+)+(\/\S*)?$/.test(s);

export const POST = withUser(async (user, request) => {
  const body = await readJson<{ urls: string[]; names: string[] }>(request);
  const raw = [...(Array.isArray(body.urls) ? body.urls : []), ...(Array.isArray(body.names) ? body.names : [])]
    .map((u) => String(u).trim())
    .filter(Boolean);
  const inputs = [...new Set(raw)].slice(0, 40);
  if (!inputs.length) return json({ error: 'Type or paste at least one source.' }, 400);

  const [{ n }] = await sql<{ n: number }[]>`select count(*)::int as n from app.sources where user_id = ${user.id}`;
  if (n >= MAX_SOURCES_PER_USER) return json({ error: `You can follow up to ${MAX_SOURCES_PER_USER} sources.` }, 400);

  // Plain names ("Stratechery", "Lenny's newsletter") are looked up with Gemini, then verified.
  const names = inputs.filter((i) => !looksLikeUrl(i));
  const [profile] = await sql<{ gemini_key_enc: string | null }[]>`select gemini_key_enc from app.profiles where user_id = ${user.id}`;
  const found = await lookupSourceUrls(names, decryptSecret(profile?.gemini_key_enc));

  const results = await mapLimit(inputs.slice(0, MAX_SOURCES_PER_USER - n), 5, async (input): Promise<AddResult> => {
    const target = looksLikeUrl(input) ? input : found.get(input);
    if (!target) return { input, ok: false, error: 'Couldn’t find a website for that name — try pasting its link.' };
    try {
      const resolved = await resolveSource(target);
      const inserted = await sql<Source[]>`
        insert into app.sources (user_id, input_url, feed_url, site_url, title, kind)
        values (${user.id}, ${target}, ${resolved.feedUrl}, ${resolved.siteUrl}, ${resolved.title.slice(0, 200)}, ${resolved.kind})
        on conflict (user_id, feed_url) do nothing returning *`;
      return {
        input,
        ok: true,
        duplicate: !inserted.length,
        title: resolved.title,
        feedUrl: resolved.feedUrl,
        kind: resolved.kind,
        via: target === input ? undefined : target,
      };
    } catch (err) {
      return { input, ok: false, error: `${target === input ? '' : `${target}: `}${err instanceof Error ? err.message : String(err)}` };
    }
  });
  await refreshNextRun(user.id);
  return json({ results, sources: await listSources(user.id) });
});
