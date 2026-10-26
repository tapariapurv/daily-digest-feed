import type { EditionLayout } from './db.ts';
import { generateJSON } from './gemini.ts';
import { truncate } from './text.ts';

// ---------- Pass 1: summarise a batch of articles ----------

export type ArticleInput = {
  id: number;
  source: string;
  title: string;
  published: string | null;
  content: string;
};

export type ArticleSummary = { id: number; summary: string; topic: string; importance: number };

const SUMMARY_SCHEMA = {
  type: 'object',
  properties: {
    items: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          id: { type: 'integer' },
          summary: { type: 'string', description: '2–3 sentences, under 70 words' },
          topic: { type: 'string', description: '1–3 word topic label in Title Case' },
          importance: { type: 'integer', minimum: 1, maximum: 5 },
        },
        required: ['id', 'summary', 'topic', 'importance'],
      },
    },
  },
  required: ['items'],
};

function readerContext(interests: string): string {
  return interests.trim()
    ? `About the reader (use this to judge importance, never mention it): ${interests.trim()}`
    : 'The reader is a curious generalist who values signal over noise.';
}

export async function summariseBatch(articles: ArticleInput[], opts: { interests: string; knownTopics: string[] }) {
  const system = [
    'You are the editor of a personal morning newsletter. You turn raw articles into crisp, trustworthy briefs.',
    '',
    'For every article, return:',
    '- summary: 2–3 sentences (under 70 words) stating the actual substance — the claim, finding, decision, number or announcement — so the reader knows what it says without clicking. Lead with the point. No "In this article", "The author discusses", hype, or rhetorical questions. Plain, specific language.',
    '- If the content is thin (just a title or teaser), write one sentence on what the piece is about, inferred from the title and source, and do not invent details. Never mention that content is missing, short or unavailable. For videos or podcasts, summarise what the episode covers.',
    '- When the content has substance, use the full 2–3 sentences and include at least one concrete specific from it (a number, name, result, mechanism or recommendation). A vague summary like "explores the factors behind X" is a failure — say what the factors are.',
    '- Write the summary in English even if the article is not.',
    '- topic: a short Title Case label (1–3 words), e.g. "AI", "Startups", "Personal Finance", "Climate". Reuse an existing label when one fits.',
    '- importance 1–5 for this reader: 5 = major news or unusually valuable insight; 4 = substantive and relevant; 3 = solid, worth a skim; 2 = minor or niche; 1 = promotional, sponsored, job posts, link roundups with no substance, housekeeping.',
    '',
    readerContext(opts.interests),
    'Return every id exactly once.',
  ].join('\n');

  const prompt = [
    opts.knownTopics.length ? `Existing topic labels: ${opts.knownTopics.join(', ')}` : '',
    'Articles (JSON):',
    JSON.stringify(
      articles.map((a) => ({ ...a, content: truncate(a.content || '(no text — headline only)', 3500) })),
    ),
  ]
    .filter(Boolean)
    .join('\n\n');

  const { data, model } = await generateJSON<{ items: ArticleSummary[] }>({ system, prompt, schema: SUMMARY_SCHEMA });
  const ids = new Set(articles.map((a) => a.id));
  const items = (data.items ?? [])
    .filter((it) => ids.has(it.id) && typeof it.summary === 'string' && it.summary.trim())
    .map((it) => ({
      id: it.id,
      summary: it.summary.trim(),
      topic: (it.topic || 'Other').trim().slice(0, 40),
      importance: Math.min(5, Math.max(1, Math.round(Number(it.importance) || 3))),
    }));
  return { items, model };
}

// ---------- Pass 2: assemble the edition ----------

export type EditionInput = { id: number; title: string; source: string; topic: string; importance: number; summary: string };

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
  },
  required: ['headline', 'intro', 'lead', 'sections'],
};

export type EditionDraft = { headline: string | null; intro: string | null; layout: EditionLayout; model: string | null };

export async function assembleEdition(items: EditionInput[], opts: { interests: string }): Promise<EditionDraft> {
  const briefly = items.filter((i) => i.importance <= 1).map((i) => i.id);
  const main = items.filter((i) => i.importance > 1);
  if (!main.length) return { headline: null, intro: null, layout: { lead: [], sections: [], briefly }, model: null };

  const system = [
    'You are assembling today’s edition of a personal morning newsletter from already-summarised articles.',
    '- headline: a calm, specific title for the edition (max 9 words) naming the day’s main threads. Not clickbait, no colon-heavy listicles, no emojis.',
    '- intro: 2–3 sentences, written like a sharp editor’s note, connecting the most important stories. Be concrete; name things. No "Welcome" or "In today’s edition".',
    `- lead: the ${main.length >= 6 ? '2–3' : '1'} most important ids for this reader.`,
    '- sections: group every remaining id into coherent topical sections (between 1 and 7; merge thin topics; avoid single-item sections unless it truly stands alone). Order sections by importance, and ids within a section by importance. Section titles are 1–3 words, Title Case.',
    '- Every id must appear exactly once across lead and sections.',
    readerContext(opts.interests),
  ].join('\n');

  const prompt = `Articles (JSON):\n${JSON.stringify(
    main.map((i) => ({ id: i.id, title: i.title, source: i.source, topic: i.topic, importance: i.importance, summary: i.summary })),
  )}`;

  let draft: { headline?: string; intro?: string; lead?: number[]; sections?: { title: string; ids: number[] }[] } = {};
  let model: string | null = null;
  try {
    const res = await generateJSON<typeof draft>({ system, prompt, schema: EDITION_SCHEMA, temperature: 0.5 });
    draft = res.data;
    model = res.model;
  } catch (err) {
    console.error('assembleEdition failed, falling back to topic grouping', err);
  }
  return { headline: draft.headline?.trim() || null, intro: draft.intro?.trim() || null, layout: normaliseLayout(main, draft, briefly), model };
}

/** Make the model's layout safe: every main item exactly once, unknown ids dropped, nothing lost. */
export function normaliseLayout(
  main: EditionInput[],
  draft: { lead?: number[]; sections?: { title: string; ids: number[] }[] },
  briefly: number[],
): EditionLayout {
  const valid = new Map(main.map((i) => [i.id, i]));
  const used = new Set<number>();
  const take = (ids: number[] | undefined, max = Infinity) => {
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

  const lead = take(draft.lead, 3);

  const sections: EditionLayout['sections'] = [];
  for (const s of draft.sections ?? []) {
    const ids = take(s.ids);
    if (ids.length) sections.push({ title: (s.title || 'More').trim().slice(0, 40), ids });
  }

  // Anything the model forgot goes into a section named after its own topic.
  const leftovers = main.filter((i) => !used.has(i.id)).sort((a, b) => b.importance - a.importance);
  for (const item of leftovers) {
    used.add(item.id);
    const match = sections.find((s) => s.title.toLowerCase() === item.topic.toLowerCase());
    if (match) match.ids.push(item.id);
    else sections.push({ title: item.topic, ids: [item.id] });
  }

  if (!lead.length && sections.length) {
    // No lead from the model: promote the single most important story.
    const top = [...main].sort((a, b) => b.importance - a.importance)[0];
    for (const s of sections) s.ids = s.ids.filter((id) => id !== top.id);
    lead.push(top.id);
  }

  return { lead, sections: sections.filter((s) => s.ids.length), briefly };
}
