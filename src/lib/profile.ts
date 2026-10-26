// Pure profile/preferences model — safe to import from client components.

export const TEMPLATES = [
  {
    id: 'broadsheet',
    name: 'Broadsheet',
    blurb: 'Warm paper, serif headlines, numbered sections. A calm morning newspaper.',
    accent: '#a23b1e',
  },
  {
    id: 'modern',
    name: 'Modern',
    blurb: 'Clean sans-serif cards with thumbnails. Feels like a well-made app.',
    accent: '#0f766e',
  },
  {
    id: 'magazine',
    name: 'Magazine',
    blurb: 'Big lead image and a multi-column grid on wide screens. Image-forward.',
    accent: '#9a3412',
  },
  {
    id: 'wire',
    name: 'Wire',
    blurb: 'Monospace, dense, headline-first. Maximum signal per scroll.',
    accent: '#15803d',
  },
] as const;

export type TemplateId = (typeof TEMPLATES)[number]['id'];

export const ACCENTS = ['#a23b1e', '#0f766e', '#1d4ed8', '#9a3412', '#be185d', '#15803d', '#7c3aed', '#1c1a17'];

export type Design = {
  template: TemplateId;
  /** Hex colour, or null for the template's own accent. */
  accent: string | null;
  mode: 'auto' | 'light' | 'dark';
  textSize: 's' | 'm' | 'l';
  density: 'comfortable' | 'compact';
  images: boolean;
};

export type SummaryStyle = 'headline' | 'tldr' | 'summary' | 'detailed';

export type Reading = {
  preset: 'quick' | 'standard' | 'deep' | 'custom';
  maxStories: number;
  summaryStyle: SummaryStyle;
  perSource: number;
  briefly: boolean;
};

export type Schedule = {
  enabled: boolean;
  /** Local times "HH:MM", up to three editions a day. */
  times: string[];
  /** 0 = Sunday … 6 = Saturday */
  days: number[];
  timezone: string;
};

export type Profile = {
  user_id: string;
  email: string | null;
  paper_name: string;
  interests: string;
  design: Design;
  reading: Reading;
  schedule: Schedule;
  email_delivery: boolean;
  has_gemini_key: boolean;
  onboarded: boolean;
  next_run_at: string | null;
};

export const READING_PRESETS: Record<Exclude<Reading['preset'], 'custom'>, Omit<Reading, 'preset' | 'briefly'> & { label: string; blurb: string }> = {
  quick: { label: 'Quick', blurb: '~3 min · 8 stories · one-line takeaways', maxStories: 8, summaryStyle: 'tldr', perSource: 2 },
  standard: { label: 'Standard', blurb: '~7 min · 15 stories · 2–3 sentence summaries', maxStories: 15, summaryStyle: 'summary', perSource: 4 },
  deep: { label: 'Deep', blurb: '~15 min · 30 stories · summaries plus key points', maxStories: 30, summaryStyle: 'detailed', perSource: 6 },
};

export const DEFAULT_DESIGN: Design = { template: 'broadsheet', accent: null, mode: 'auto', textSize: 'm', density: 'comfortable', images: true };
export const DEFAULT_READING: Reading = { preset: 'standard', maxStories: 15, summaryStyle: 'summary', perSource: 4, briefly: true };
export const DEFAULT_SCHEDULE: Schedule = { enabled: true, times: ['07:00'], days: [0, 1, 2, 3, 4, 5, 6], timezone: 'UTC' };

const clamp = (n: unknown, min: number, max: number, fallback: number) => {
  const v = Math.round(Number(n));
  return Number.isFinite(v) ? Math.min(max, Math.max(min, v)) : fallback;
};
const oneOf = <T extends string>(value: unknown, options: readonly T[], fallback: T): T =>
  options.includes(value as T) ? (value as T) : fallback;

export function normaliseDesign(raw: Partial<Design> | null | undefined): Design {
  const d = raw ?? {};
  return {
    template: oneOf(d.template, TEMPLATES.map((t) => t.id), DEFAULT_DESIGN.template),
    accent: typeof d.accent === 'string' && /^#[0-9a-f]{6}$/i.test(d.accent) ? d.accent : null,
    mode: oneOf(d.mode, ['auto', 'light', 'dark'] as const, 'auto'),
    textSize: oneOf(d.textSize, ['s', 'm', 'l'] as const, 'm'),
    density: oneOf(d.density, ['comfortable', 'compact'] as const, 'comfortable'),
    images: typeof d.images === 'boolean' ? d.images : DEFAULT_DESIGN.images,
  };
}

export function normaliseReading(raw: Partial<Reading> | null | undefined): Reading {
  const r = raw ?? {};
  const preset = oneOf(r.preset, ['quick', 'standard', 'deep', 'custom'] as const, 'standard');
  const briefly = typeof r.briefly === 'boolean' ? r.briefly : true;
  if (preset !== 'custom') {
    const p = READING_PRESETS[preset];
    return { preset, maxStories: p.maxStories, summaryStyle: p.summaryStyle, perSource: p.perSource, briefly };
  }
  return {
    preset,
    maxStories: clamp(r.maxStories, 3, 60, 15),
    summaryStyle: oneOf(r.summaryStyle, ['headline', 'tldr', 'summary', 'detailed'] as const, 'summary'),
    perSource: clamp(r.perSource, 1, 15, 4),
    briefly,
  };
}

export function isValidTimezone(tz: unknown): tz is string {
  if (typeof tz !== 'string' || !tz) return false;
  try {
    new Intl.DateTimeFormat('en', { timeZone: tz });
    return true;
  } catch {
    return false;
  }
}

export function normaliseSchedule(raw: Partial<Schedule> | null | undefined): Schedule {
  const s = raw ?? {};
  const times = (Array.isArray(s.times) ? s.times : DEFAULT_SCHEDULE.times)
    .filter((t): t is string => typeof t === 'string' && /^([01]\d|2[0-3]):[0-5]\d$/.test(t))
    .slice(0, 3);
  const days = (Array.isArray(s.days) ? s.days : DEFAULT_SCHEDULE.days).filter((d) => Number.isInteger(d) && d >= 0 && d <= 6);
  return {
    enabled: typeof s.enabled === 'boolean' ? s.enabled : true,
    times: times.length ? [...new Set(times)].sort() : ['07:00'],
    days: days.length ? [...new Set(days)].sort() : [0, 1, 2, 3, 4, 5, 6],
    timezone: isValidTimezone(s.timezone) ? s.timezone : 'UTC',
  };
}
