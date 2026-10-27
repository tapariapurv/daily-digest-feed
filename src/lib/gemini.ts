const ENDPOINT = 'https://generativelanguage.googleapis.com/v1beta/models';

// Ordered by preference. Flash writes noticeably better summaries; Flash-Lite is
// the fast, high-quota fallback when Flash is overloaded or rate-limited.
const DEFAULT_MODELS = ['gemini-3.5-flash', 'gemini-flash-lite-latest', 'gemini-3.5-flash-lite', 'gemini-flash-latest'];

export function geminiModels(): string[] {
  const fromEnv = process.env.GEMINI_MODELS?.split(',').map((m) => m.trim()).filter(Boolean);
  return fromEnv?.length ? fromEnv : DEFAULT_MODELS;
}

export class GeminiError extends Error {
  readonly status: number;
  /** True when any model refused because of quota / rate limits. */
  readonly quota: boolean;
  constructor(message: string, status: number, quota = false) {
    super(message);
    this.status = status;
    this.quota = quota;
  }
}

export type GenerateOptions = {
  apiKey?: string | null;
  system: string;
  prompt: string;
  schema: object;
  temperature?: number;
  timeoutMs?: number;
  models?: string[];
};

async function callModel(model: string, opts: GenerateOptions): Promise<unknown> {
  const key = opts.apiKey || process.env.GEMINI_API_KEY;
  if (!key) throw new GeminiError('GEMINI_API_KEY is not set', 401);
  const res = await fetch(`${ENDPOINT}/${model}:generateContent`, {
    method: 'POST',
    signal: AbortSignal.timeout(opts.timeoutMs ?? 75_000),
    headers: { 'x-goog-api-key': key, 'content-type': 'application/json' },
    body: JSON.stringify({
      systemInstruction: { parts: [{ text: opts.system }] },
      contents: [{ role: 'user', parts: [{ text: opts.prompt }] }],
      generationConfig: {
        temperature: opts.temperature ?? 0.3,
        responseMimeType: 'application/json',
        responseJsonSchema: opts.schema,
        thinkingConfig: { thinkingLevel: 'low' },
      },
    }),
  });
  const body = (await res.json().catch(() => ({}))) as {
    error?: { message?: string };
    candidates?: { content?: { parts?: { text?: string }[] }; finishReason?: string }[];
  };
  if (!res.ok) throw new GeminiError(body.error?.message ?? `HTTP ${res.status}`, res.status);
  const text = body.candidates?.[0]?.content?.parts?.map((p) => p.text ?? '').join('') ?? '';
  if (!text) throw new GeminiError(`Empty response (${body.candidates?.[0]?.finishReason ?? 'unknown'})`, 502);
  try {
    return JSON.parse(text);
  } catch {
    throw new GeminiError('Model returned invalid JSON', 502);
  }
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/**
 * Ask Gemini for structured JSON, walking down the model chain on overload,
 * rate limits, timeouts or bad output. Each model gets one quick retry.
 */
export const geminiGenerate = <T>(opts: GenerateOptions) => generateWithKey<T>(opts);

async function generateWithKey<T>(opts: GenerateOptions): Promise<{ data: T; model: string }> {
  const errors: string[] = [];
  let quota = false;
  for (const model of opts.models ?? geminiModels()) {
    for (let attempt = 0; attempt < 2; attempt++) {
      try {
        return { data: (await callModel(model, opts)) as T, model };
      } catch (err) {
        const status = err instanceof GeminiError ? err.status : 0;
        const msg = err instanceof Error ? (err.name === 'TimeoutError' ? 'timed out' : err.message) : String(err);
        errors.push(`${model}: ${msg.slice(0, 160)}`);
        if (status === 429 || /quota|rate limit|resource.?exhausted/i.test(msg)) quota = true;
        if (status === 401 || status === 403) throw new GeminiError(`Gemini rejected the API key: ${msg}`, status);
        // Not found / bad request / timeout: this model won't work now, move on.
        if (status === 404 || status === 400 || msg === 'timed out') break;
        if (attempt === 0) await sleep(status === 429 ? 4000 : 1500);
      }
    }
  }
  throw new GeminiError(`All models failed — ${errors.join(' | ')}`, 503, quota);
}
