import type { EditionLayout } from './db.ts';
import { generateJSON, type AiAuth } from './ai.ts';
import { truncate } from './text.ts';

// ---------- Pass 1: summarise a batch of articles (shared by every reader) ----------

export type ArticleInput = {
  id: number;
  source: string;
  title: string;
  published: string | null;
  content: string;
};

export type ArticleSummary = {
  id: number;
  tldr: string;
  summary: string;
  key_points: string[];
  topic: string;
  quality: number;
};

const SUMMARY_SCHEMA = {
  type: 'object',
  properties: {
    items: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          id: { type: 'integer' },
          tldr: { type: 'string', description: 'One line, under 20 words' },
          summary: { type: 'string', description: '2–3 sentences, under 70 words' },
          key_points: { type: 'array', items: { type: 'string' }, description: '2–4 short takeaways' },
          topic: { type: 'string', description: '1–3 word topic label in Title Case' },
          quality: { type: 'integer', minimum: 1, maximum: 5 },
        },
        required: ['id', 'tldr', 'summary', 'key_points', 'topic', 'quality'],
      },
    },
  },
  required: ['items'],
};

export async function summariseBatch(articles: ArticleInput[], opts: { knownTopics: string[] } & AiAuth) {
  const system = [
    'You are the editor of a morning newsletter. You turn raw articles into crisp, trustworthy briefs.',
    '',
    'For every article, return:',
    '- tldr: one line (under 20 words) with the single most important point. No "This article…".',
    '- summary: 2–3 sentences (under 70 words) stating the actual substance — the claim, finding, decision, number or announcement — so the reader knows what it says without clicking. Lead with the point. No "In this article", "The author discusses", hype, or rhetorical questions.',
    '- When the content has substance, include at least one concrete specific (a number, name, result, mechanism or recommendation). A vague summary like "explores the factors behind X" is a failure — say what the factors are.',
    '- key_points: 2–4 short takeaways (under 15 words each) that add detail beyond the summary.',
    '- If the content is thin (just a title or teaser), keep everything to what can be reliably inferred from the title and source; do not invent details and never mention that content is missing. For videos or podcasts, summarise what the episode covers.',
    '- Write in English even if the article is not.',
    '- topic: a short Title Case label (1–3 words), e.g. "AI", "Startups", "Personal Finance", "Climate". Reuse an existing label when one fits.',
    '- quality 1–5 for a general thoughtful reader: 5 = major news or unusually valuable insight; 4 = substantive; 3 = solid; 2 = minor or niche; 1 = promotional, sponsored, job posts, link dumps, housekeeping.',
    'Return every id exactly once.',
  ].join('\n');

  const prompt = [
    opts.knownTopics.length ? `Existing topic labels: ${opts.knownTopics.join(', ')}` : '',
    'Articles (JSON):',
    JSON.stringify(articles.map((a) => ({ ...a, content: truncate(a.content || '(headline only)', 3500) }))),
  ]
    .filter(Boolean)
    .join('\n\n');

  const { data, model } = await generateJSON<{ items: ArticleSummary[] }>({ system, prompt, schema: SUMMARY_SCHEMA, reader: opts.reader, onKeyFallback: opts.onKeyFallback });
  const ids = new Set(articles.map((a) => a.id));
  const items = (data.items ?? [])
    .filter((it) => ids.has(it.id) && typeof it.summary === 'string' && it.summary.trim())
    .map((it) => ({
      id: it.id,
      tldr: (it.tldr || it.summary).trim().slice(0, 240),
      summary: it.summary.trim(),
      key_points: (Array.isArray(it.key_points) ? it.key_points : []).map((k) => String(k).trim()).filter(Boolean).slice(0, 4),
      topic: (it.topic || 'Other').trim().slice(0, 40),
      quality: Math.min(5, Math.max(1, Math.round(Number(it.quality) || 3))),
    }));
  return { items, model };
}

// ---------- Pass 2: assemble one reader's edition ----------

export type EditionInput = { id: number; title: string; source: string; topic: string; quality: number; tldr: string; published: string | null };

const EDITION_SCHEMA = {
  type: 'object',
  properties: {
    headline: { type: 'string', description: 'Edition title, max 9 words' },
    intro: { type: 'string', description: '2–3 sentence overview of the day' },
    lead: { type: 'array', items: { type: 'integer' }, description: 'Up to 3 most important ids' },
    sections: {
      type: 'array',
      items: {
        type: 'object',
        properties: { title: { type: 'string' }, ids: { type: 'array', items: { type: 'integer' } } },
        required: ['title', 'ids'],
      },
    },
    briefly: { type: 'array', items: { type: 'integer' }, description: 'Lower-value ids worth a one-line mention' },
  },
  required: ['headline', 'intro', 'lead', 'sections', 'briefly'],
};

export type EditionDraft = { headline: string | null; intro: string | null; layout: EditionLayout; model: string | null };

export type EditionOptions = { interests: string; maxStories: number; briefly: boolean } & AiAuth;

export async function assembleEdition(items: EditionInput[], opts: EditionOptions): Promise<EditionDraft> {
  if (!items.length) return { headline: null, intro: null, layout: { lead: [], sections: [], briefly: [] }, model: null };
  const leadCount = items.length >= 6 ? '2–3' : '1';
  const system = [
    'You are assembling today’s edition of a personal morning newsletter from already-summarised articles.',
    opts.interests.trim()
      ? `About the reader (use it to choose and rank, never mention it): ${opts.interests.trim()}`
      : 'The reader is a curious generalist who values signal over noise.',
    `- Choose at most ${opts.maxStories} stories in total for lead + sections: the ones that matter most to this reader. Combine the article quality score with the reader’s interests; prefer recent items.`,
    `- lead: the ${leadCount} most important chosen ids.`,
    '- sections: group the other chosen ids into coherent topical sections (between 1 and 7; merge thin topics; avoid single-item sections unless it truly stands alone). Order sections by importance, and ids within a section by importance. Section titles are 1–3 words, Title Case.',
    opts.briefly
      ? '- briefly: up to 12 remaining ids that are still worth a one-line mention. Promotional/sponsored/housekeeping items go here or nowhere.'
      : '- briefly: return an empty list.',
    '- Ids not chosen anywhere are simply left out. Never use an id twice.',
    '- headline: a calm, specific title for the edition (max 9 words) naming the day’s main threads. Not clickbait, no emojis.',
    '- intro: 2–3 sentences, like a sharp editor’s note, connecting the most important chosen stories. Concrete; name things. No "Welcome" or "In today’s edition".',
  ].join('\n');

  const prompt = `Articles (JSON):\n${JSON.stringify(items)}`;
  let draft: { headline?: string; intro?: string; lead?: number[]; sections?: { title: string; ids: number[] }[]; briefly?: number[] } = {};
  let model: string | null = null;
  try {
    const res = await generateJSON<typeof draft>({ system, prompt, schema: EDITION_SCHEMA, temperature: 0.5, reader: opts.reader, onKeyFallback: opts.onKeyFallback });
    draft = res.data;
    model = res.model;
  } catch (err) {
    console.error('assembleEdition failed, falling back to topic grouping', err);
  }
  return {
    headline: draft.headline?.trim() || null,
    intro: draft.intro?.trim() || null,
    layout: normaliseLayout(items, draft, opts),
    model,
  };
}

/**
 * Make the model's layout safe: ids valid and unique, caps respected. If the model
 * failed or under-filled the edition, the best remaining stories are added by quality.
 */
export function normaliseLayout(
  items: EditionInput[],
  draft: { lead?: number[]; sections?: { title: string; ids: number[] }[]; briefly?: number[] },
  opts: { maxStories: number; briefly: boolean },
): EditionLayout {
  const valid = new Map(items.map((i) => [i.id, i]));
  const used = new Set<number>();
  let budget = Math.max(1, opts.maxStories);
  const take = (ids: number[] | undefined, max: number) => {
    const out: number[] = [];
    for (const id of ids ?? []) {
      if (out.length >= max) break;
      if (valid.has(id) && !used.has(id)) {
        used.add(id);
        out.push(id);
      }
    }
    return out;
  };

  const lead = take(draft.lead, Math.min(3, budget));
  budget -= lead.length;
  const sections: EditionLayout['sections'] = [];
  for (const s of draft.sections ?? []) {
    if (budget <= 0) break;
    const ids = take(s.ids, budget);
    budget -= ids.length;
    if (ids.length) sections.push({ title: (s.title || 'More').trim().slice(0, 40), ids });
  }

  const modelChoseNothing = !lead.length && !sections.length;
  // Fill: if the model failed, or gave us fewer stories than allowed, add the best of the rest.
  if (modelChoseNothing || budget > 0) {
    const rest = items
      .filter((i) => !used.has(i.id) && !(draft.briefly ?? []).includes(i.id) && i.quality >= 2)
      .sort((a, b) => b.quality - a.quality);
    for (const item of rest) {
      if (budget <= 0) break;
      used.add(item.id);
      budget--;
      const match = sections.find((s) => s.title.toLowerCase() === item.topic.toLowerCase());
      if (match) match.ids.push(item.id);
      else sections.push({ title: item.topic, ids: [item.id] });
    }
  }

  if (!lead.length && sections.length) {
    const all = sections.flatMap((s) => s.ids).map((id) => valid.get(id)!);
    const top = all.sort((a, b) => b.quality - a.quality)[0];
    for (const s of sections) s.ids = s.ids.filter((id) => id !== top.id);
    lead.push(top.id);
  }

  const briefly = opts.briefly
    ? [
        ...take(draft.briefly, 12),
        ...take(
          items.filter((i) => !used.has(i.id)).sort((a, b) => b.quality - a.quality).map((i) => i.id),
          modelChoseNothing ? 12 : 0,
        ),
      ].slice(0, 12)
    : [];

  return { lead, sections: sections.filter((s) => s.ids.length), briefly };
}
