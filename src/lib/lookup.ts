import { generateJSON, type AiAuth } from './ai.ts';

/**
 * Turn names people type ("Stratechery", "Lenny's newsletter", "Veritasium") into
 * official web addresses. Every suggestion is then verified by resolveSource, so a
 * wrong guess fails loudly instead of adding the wrong thing.
 */
export async function lookupSourceUrls(names: string[], ai: AiAuth = {}): Promise<Map<string, string | null>> {
  const out = new Map<string, string | null>(names.map((n) => [n, null]));
  if (!names.length) return out;
  try {
    const { data } = await generateJSON<{ results: { name: string; url: string }[] }>({
      ...ai,
      models: ['gemini-3.5-flash', 'gemini-flash-lite-latest', 'gemini-3.5-flash-lite'],
      timeoutMs: 40_000,
      temperature: 0,
      system: [
        'You map the names of publications, blogs, newsletters, podcasts, YouTube channels, subreddits and writers to their official home page URL.',
        'Prefer the canonical home page (e.g. https://stratechery.com, https://www.youtube.com/@veritasium, https://www.reddit.com/r/programming).',
        'For a person, give their personal blog or newsletter. If you are not confident, return an empty string rather than guessing.',
      ].join('\n'),
      prompt: JSON.stringify(names),
      schema: {
        type: 'object',
        properties: {
          results: {
            type: 'array',
            items: { type: 'object', properties: { name: { type: 'string' }, url: { type: 'string', description: 'Home page URL, or empty string if unsure' } }, required: ['name', 'url'] },
          },
        },
        required: ['results'],
      },
    });
    for (const r of data.results ?? []) {
      if (out.has(r.name) && typeof r.url === 'string' && /^https?:\/\//.test(r.url)) out.set(r.name, r.url);
    }
  } catch (err) {
    console.error('lookupSourceUrls failed', err);
  }
  return out;
}
