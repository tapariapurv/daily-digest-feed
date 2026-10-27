// One entry point for every AI call. Readers can bring their own provider and key;
// everything else (and any reader whose provider fails) runs on the shared Gemini key.
import Anthropic from '@anthropic-ai/sdk';
import { GeminiError, geminiGenerate } from './gemini.ts';
import { providerInfo, type AiConfig, type ProviderId } from './providers.ts';

export type ReaderAi = AiConfig & { apiKey: string | null };

export type AiAuth = {
  /** The reader's own provider + key, when they configured one. */
  reader?: ReaderAi | null;
  /** Called when the reader's provider failed and the shared key was used instead. */
  onKeyFallback?: (reason: string) => void;
};

type GenerateOptions = AiAuth & {
  system: string;
  prompt: string;
  schema: object;
  temperature?: number;
  timeoutMs?: number;
  /** Shared-Gemini model chain override (e.g. Flash-Lite for cheap classification). */
  models?: string[];
};

export class AiError extends Error {
  readonly status: number;
  readonly quota: boolean;
  constructor(message: string, status: number, quota = false) {
    super(message);
    this.status = status;
    this.quota = quota;
  }
}

function reasonFor(err: unknown, provider: ProviderId): string {
  const name = providerInfo(provider).name;
  const status = err instanceof AiError || err instanceof GeminiError ? err.status : 0;
  const quota = (err instanceof AiError || err instanceof GeminiError) && err.quota;
  if (status === 401 || status === 403) return `${name} rejected your API key`;
  if (quota || status === 429) return `Your ${name} key hit its rate or usage limit`;
  if (status === 404) return `${name} couldn’t find the model you chose`;
  return `${name} didn’t respond properly (${err instanceof Error ? err.message.slice(0, 120) : 'unknown error'})`;
}

export async function generateJSON<T>(opts: GenerateOptions): Promise<{ data: T; model: string }> {
  const reader = opts.reader;
  if (!reader || reader.provider === 'shared') return geminiGenerate<T>({ ...opts, apiKey: null });
  try {
    return await readerGenerate<T>(reader, opts);
  } catch (err) {
    if (!process.env.GEMINI_API_KEY) throw err;
    // Keep the paper printing: fall back to the shared key and tell the reader why.
    opts.onKeyFallback?.(reasonFor(err, reader.provider));
    return geminiGenerate<T>({ ...opts, apiKey: null });
  }
}

async function readerGenerate<T>(reader: ReaderAi, opts: GenerateOptions): Promise<{ data: T; model: string }> {
  switch (reader.provider) {
    case 'gemini':
      return geminiGenerate<T>({ ...opts, apiKey: reader.apiKey, models: reader.model ? [reader.model] : opts.models });
    case 'anthropic':
      return anthropicGenerate<T>(reader, opts);
    default:
      return openAiCompatibleGenerate<T>(reader, opts);
  }
}

// ---------- Schema adaptation ----------

/** Structured-output dialects want closed objects and no numeric bounds. */
export function strictSchema(schema: unknown): unknown {
  if (Array.isArray(schema)) return schema.map(strictSchema);
  if (!schema || typeof schema !== 'object') return schema;
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(schema)) {
    if (['minimum', 'maximum', 'exclusiveMinimum', 'exclusiveMaximum', 'multipleOf', 'minLength', 'maxLength'].includes(k)) continue;
    out[k] = strictSchema(v);
  }
  if (out.type === 'object') {
    out.additionalProperties = false;
    if (out.properties && !out.required) out.required = Object.keys(out.properties as object);
  }
  return out;
}

function parseJsonText(text: string): unknown {
  const cleaned = text.trim().replace(/^```(?:json)?\s*/i, '').replace(/```\s*$/, '');
  try {
    return JSON.parse(cleaned);
  } catch {
    const start = cleaned.indexOf('{');
    const end = cleaned.lastIndexOf('}');
    if (start >= 0 && end > start) return JSON.parse(cleaned.slice(start, end + 1));
    throw new AiError('Model returned invalid JSON', 502);
  }
}

// ---------- Anthropic (official SDK, structured outputs) ----------

async function anthropicGenerate<T>(reader: ReaderAi, opts: GenerateOptions): Promise<{ data: T; model: string }> {
  const model = reader.model || 'claude-opus-5-5';
  const client = new Anthropic({ apiKey: reader.apiKey ?? undefined, timeout: opts.timeoutMs ?? 120_000, maxRetries: 1 });
  try {
    const response = await client.messages.create({
      model,
      max_tokens: 16000,
      system: opts.system,
      messages: [{ role: 'user', content: opts.prompt }],
      // Summaries and layout are routine work: low effort keeps it fast and cheap.
      output_config: { effort: 'low', format: { type: 'json_schema', schema: strictSchema(opts.schema) as Record<string, unknown> } },
    });
    if (response.stop_reason === 'refusal') throw new AiError('Claude declined this request', 502);
    if (response.stop_reason === 'max_tokens') throw new AiError('Claude ran out of output tokens', 502);
    const text = response.content.flatMap((b) => (b.type === 'text' ? [b.text] : [])).join('');
    return { data: parseJsonText(text) as T, model };
  } catch (err) {
    if (err instanceof AiError) throw err;
    if (err instanceof Anthropic.AuthenticationError || err instanceof Anthropic.PermissionDeniedError) throw new AiError(err.message, err.status);
    if (err instanceof Anthropic.RateLimitError) throw new AiError(err.message, 429, true);
    if (err instanceof Anthropic.NotFoundError) throw new AiError(err.message, 404);
    if (err instanceof Anthropic.APIError) throw new AiError(err.message, err.status ?? 502);
    throw new AiError(err instanceof Error ? err.message : String(err), 502);
  }
}

// ---------- OpenAI and compatible APIs (Groq, OpenRouter, custom) ----------

function baseUrlFor(reader: ReaderAi): string {
  const base = reader.provider === 'custom' ? reader.baseUrl : providerInfo(reader.provider).baseUrl;
  if (!base) throw new AiError('No API address configured', 400);
  return base.replace(/\/+$/, '');
}

function authHeaders(reader: ReaderAi): Record<string, string> {
  const h: Record<string, string> = { 'content-type': 'application/json' };
  if (reader.apiKey) h.authorization = `Bearer ${reader.apiKey}`;
  if (reader.provider === 'openrouter') {
    h['http-referer'] = process.env.SITE_URL ?? 'https://morning-digest.app';
    h['x-title'] = 'Morning Digest';
  }
  return h;
}

async function openAiCompatibleGenerate<T>(reader: ReaderAi, opts: GenerateOptions): Promise<{ data: T; model: string }> {
  const model = reader.model;
  if (!model) throw new AiError('No model chosen', 400);
  const schema = strictSchema(opts.schema);
  // OpenAI enforces JSON Schema natively; for the others, ask for JSON and describe the shape.
  const native = reader.provider === 'openai';
  const body: Record<string, unknown> = {
    model,
    messages: [
      { role: 'system', content: native ? opts.system : `${opts.system}\n\nRespond with only a JSON object matching this JSON Schema:\n${JSON.stringify(schema)}` },
      { role: 'user', content: opts.prompt },
    ],
    response_format: native ? { type: 'json_schema', json_schema: { name: 'result', schema, strict: false } } : { type: 'json_object' },
  };
  // Some reasoning models only accept the default temperature.
  if (!native && opts.temperature !== undefined) body.temperature = opts.temperature;

  let res: Response;
  try {
    res = await fetch(`${baseUrlFor(reader)}/chat/completions`, {
      method: 'POST',
      headers: authHeaders(reader),
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(opts.timeoutMs ?? 120_000),
    });
  } catch (err) {
    throw new AiError(err instanceof Error && err.name === 'TimeoutError' ? 'timed out' : String(err), 504);
  }
  const json = (await res.json().catch(() => ({}))) as {
    error?: { message?: string; code?: string } | string;
    choices?: { message?: { content?: string | null }; finish_reason?: string }[];
  };
  if (!res.ok) {
    const msg = typeof json.error === 'string' ? json.error : json.error?.message ?? `HTTP ${res.status}`;
    throw new AiError(msg, res.status, res.status === 429 || /quota|rate.?limit|insufficient/i.test(msg));
  }
  const text = json.choices?.[0]?.message?.content ?? '';
  if (!text) throw new AiError(`Empty response (${json.choices?.[0]?.finish_reason ?? 'unknown'})`, 502);
  return { data: parseJsonText(text) as T, model };
}

// ---------- Key checks and model lists ----------

/** Only public HTTPS endpoints may be used for custom providers (no internal addresses). */
export function assertPublicBaseUrl(raw: string | null): string {
  let url: URL;
  try {
    url = new URL(raw ?? '');
  } catch {
    throw new AiError('Enter the API address, e.g. https://api.deepseek.com/v1', 400);
  }
  const host = url.hostname.toLowerCase();
  const privateHost =
    host === 'localhost' ||
    host.endsWith('.local') ||
    host.endsWith('.internal') ||
    /^(127\.|10\.|192\.168\.|169\.254\.|0\.)/.test(host) ||
    /^172\.(1[6-9]|2\d|3[01])\./.test(host) ||
    host.startsWith('[');
  if (url.protocol !== 'https:' || privateHost) throw new AiError('The API address must be a public https:// URL.', 400);
  return url.href.replace(/\/+$/, '');
}

const CHAT_MODEL = /^(gpt|o\d|chatgpt)/i;
const NON_CHAT = /(embed|whisper|tts|audio|realtime|transcribe|image|dall-e|moderation|search|guard|vision-preview|computer-use)/i;

/** Verify a key by listing the models it can use. Throws AiError with a readable message. */
export async function listModels(reader: ReaderAi): Promise<string[]> {
  const fail = (status: number, msg: string): never => {
    if (status === 401 || status === 403) throw new AiError(`${providerInfo(reader.provider).name} didn’t accept that key.`, status);
    throw new AiError(msg || `HTTP ${status}`, status);
  };
  if (reader.provider === 'shared') return [];

  if (reader.provider === 'gemini') {
    const res = await fetch('https://generativelanguage.googleapis.com/v1beta/models?pageSize=200', {
      headers: { 'x-goog-api-key': reader.apiKey ?? '' },
      signal: AbortSignal.timeout(15_000),
    });
    const body = (await res.json().catch(() => ({}))) as { models?: { name: string; supportedGenerationMethods?: string[] }[]; error?: { message?: string } };
    if (!res.ok) fail(res.status === 400 ? 401 : res.status, body.error?.message ?? '');
    return (body.models ?? [])
      .filter((m) => m.supportedGenerationMethods?.includes('generateContent') && /gemini/i.test(m.name) && !/(tts|image|embedding|robotics|computer-use|transcribe)/i.test(m.name))
      .map((m) => m.name.replace(/^models\//, ''));
  }

  if (reader.provider === 'anthropic') {
    const client = new Anthropic({ apiKey: reader.apiKey ?? undefined, timeout: 15_000, maxRetries: 0 });
    try {
      const ids: string[] = [];
      for await (const m of client.models.list()) ids.push(m.id);
      return ids;
    } catch (err) {
      if (err instanceof Anthropic.APIError) fail(err.status ?? 502, err.message);
      throw new AiError(err instanceof Error ? err.message : String(err), 502);
    }
  }

  const base = reader.provider === 'custom' ? assertPublicBaseUrl(reader.baseUrl) : baseUrlFor(reader);
  const res = await fetch(`${base}/models`, { headers: authHeaders(reader), signal: AbortSignal.timeout(15_000) }).catch(() => null);
  if (!res) throw new AiError('Couldn’t reach that API address.', 502);
  const body = (await res.json().catch(() => ({}))) as { data?: { id: string }[]; error?: { message?: string } | string };
  if (!res.ok) fail(res.status, typeof body.error === 'string' ? body.error : body.error?.message ?? '');
  let ids = (body.data ?? []).map((m) => m.id).filter(Boolean);
  if (reader.provider === 'openai') ids = ids.filter((id) => CHAT_MODEL.test(id) && !NON_CHAT.test(id));
  else ids = ids.filter((id) => !NON_CHAT.test(id));
  // OpenRouter lists models without checking the key, so check the key separately.
  if (reader.provider === 'openrouter') {
    const keyRes = await fetch(`${base}/key`, { headers: authHeaders(reader), signal: AbortSignal.timeout(15_000) }).catch(() => null);
    if (!keyRes || !keyRes.ok) fail(keyRes?.status ?? 401, '');
    ids.sort((a, b) => Number(b.endsWith(':free')) - Number(a.endsWith(':free')));
  }
  return ids.sort((a, b) => (reader.provider === 'openrouter' ? 0 : a.localeCompare(b)));
}
