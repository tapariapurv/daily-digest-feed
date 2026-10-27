// AI providers a reader can choose. Pure data — safe to import from client components.

export const PROVIDERS = [
  { id: 'shared', name: 'Shared Gemini', note: 'Free · no setup', needsKey: false, keyUrl: null, baseUrl: null, preferred: [] },
  {
    id: 'gemini',
    name: 'Google Gemini',
    note: 'Free tier',
    needsKey: true,
    keyUrl: 'https://aistudio.google.com/apikey',
    baseUrl: null,
    preferred: ['gemini-3.5-flash', 'gemini-flash-latest', 'gemini-3.5-flash-lite'],
  },
  {
    id: 'groq',
    name: 'Groq',
    note: 'Free tier · very fast',
    needsKey: true,
    keyUrl: 'https://console.groq.com/keys',
    baseUrl: 'https://api.groq.com/openai/v1',
    preferred: ['openai/gpt-oss-120b', 'llama-3.3-70b-versatile', 'openai/gpt-oss-20b'],
  },
  {
    id: 'openrouter',
    name: 'OpenRouter',
    note: 'Hundreds of models · some free',
    needsKey: true,
    keyUrl: 'https://openrouter.ai/keys',
    baseUrl: 'https://openrouter.ai/api/v1',
    preferred: [],
  },
  {
    id: 'anthropic',
    name: 'Anthropic Claude',
    note: 'Paid',
    needsKey: true,
    keyUrl: 'https://console.anthropic.com/settings/keys',
    baseUrl: null,
    preferred: ['claude-opus-5-5'],
  },
  {
    id: 'openai',
    name: 'OpenAI',
    note: 'Paid',
    needsKey: true,
    keyUrl: 'https://platform.openai.com/api-keys',
    baseUrl: 'https://api.openai.com/v1',
    preferred: ['gpt-5-mini', 'gpt-5', 'gpt-4.1-mini', 'gpt-4o-mini'],
  },
  {
    id: 'custom',
    name: 'Other (OpenAI-compatible)',
    note: 'DeepSeek, Together, Mistral, self-hosted…',
    needsKey: false,
    keyUrl: null,
    baseUrl: null,
    preferred: [],
  },
] as const;

export type ProviderId = (typeof PROVIDERS)[number]['id'];

export type AiConfig = { provider: ProviderId; model: string | null; baseUrl: string | null };

export const DEFAULT_AI: AiConfig = { provider: 'shared', model: null, baseUrl: null };

export function providerInfo(id: ProviderId) {
  return PROVIDERS.find((p) => p.id === id) ?? PROVIDERS[0];
}

export function normaliseAi(raw: Partial<AiConfig> | null | undefined): AiConfig {
  const r = raw ?? {};
  const provider = PROVIDERS.some((p) => p.id === r.provider) ? (r.provider as ProviderId) : 'shared';
  return {
    provider,
    model: provider !== 'shared' && typeof r.model === 'string' && r.model.trim() ? r.model.trim().slice(0, 200) : null,
    baseUrl: provider === 'custom' && typeof r.baseUrl === 'string' && r.baseUrl.trim() ? r.baseUrl.trim().replace(/\/+$/, '').slice(0, 300) : null,
  };
}

/** Pick a sensible default from the models a key can see. */
export function pickDefaultModel(id: ProviderId, models: string[]): string | null {
  for (const want of providerInfo(id).preferred) if (models.includes(want)) return want;
  if (id === 'openrouter') return models.find((m) => m.endsWith(':free')) ?? models[0] ?? null;
  return models[0] ?? null;
}
