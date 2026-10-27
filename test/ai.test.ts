import assert from 'node:assert/strict';
import { afterEach, test } from 'node:test';
import { assertPublicBaseUrl, generateJSON, strictSchema } from '../src/lib/ai.ts';
import { normaliseAi, pickDefaultModel } from '../src/lib/providers.ts';

const realFetch = globalThis.fetch;
afterEach(() => {
  globalThis.fetch = realFetch;
});

test('schemas are closed and stripped of numeric bounds for structured-output APIs', () => {
  const out = strictSchema({
    type: 'object',
    properties: { n: { type: 'integer', minimum: 1, maximum: 5 }, list: { type: 'array', items: { type: 'object', properties: { a: { type: 'string' } } } } },
    required: ['n'],
  }) as Record<string, any>;
  assert.equal(out.additionalProperties, false);
  assert.deepEqual(out.required, ['n']);
  assert.equal(out.properties.n.minimum, undefined);
  assert.equal(out.properties.list.items.additionalProperties, false);
  assert.deepEqual(out.properties.list.items.required, ['a']);
});

test('provider settings are validated', () => {
  assert.deepEqual(normaliseAi({ provider: 'nope' as never }), { provider: 'shared', model: null, baseUrl: null });
  assert.deepEqual(normaliseAi({ provider: 'groq', model: ' llama ', baseUrl: 'https://x' }), { provider: 'groq', model: 'llama', baseUrl: null });
  assert.equal(normaliseAi({ provider: 'custom', baseUrl: 'https://api.deepseek.com/v1/' }).baseUrl, 'https://api.deepseek.com/v1');
});

test('default model prefers known-good choices', () => {
  assert.equal(pickDefaultModel('anthropic', ['claude-haiku-5-5', 'claude-opus-5-5']), 'claude-opus-5-5');
  assert.equal(pickDefaultModel('openrouter', ['a/paid', 'b/thing:free']), 'b/thing:free');
  assert.equal(pickDefaultModel('custom', ['m1', 'm2']), 'm1');
  assert.equal(pickDefaultModel('groq', []), null);
});

test('custom endpoints must be public https', () => {
  assert.equal(assertPublicBaseUrl('https://api.deepseek.com/v1/'), 'https://api.deepseek.com/v1');
  for (const bad of ['http://api.example.com', 'https://localhost:11434', 'https://127.0.0.1/v1', 'https://10.0.0.5', 'https://192.168.1.2', 'https://169.254.169.254', 'not a url']) {
    assert.throws(() => assertPublicBaseUrl(bad), /https|address/, bad);
  }
});

test('a failing reader key falls back to the shared Gemini and reports why', async () => {
  process.env.GEMINI_API_KEY = 'shared-key';
  const calls: string[] = [];
  globalThis.fetch = (async (url: string | URL) => {
    const u = String(url);
    calls.push(u);
    if (u.startsWith('https://api.groq.com')) return new Response(JSON.stringify({ error: { message: 'Invalid API Key' } }), { status: 401 });
    return new Response(JSON.stringify({ candidates: [{ content: { parts: [{ text: '{"ok":true}' }] } }] }), { status: 200 });
  }) as typeof fetch;
  let reason: string | null = null;
  const { data } = await generateJSON<{ ok: boolean }>({
    reader: { provider: 'groq', model: 'llama', baseUrl: null, apiKey: 'bad' },
    onKeyFallback: (r) => (reason = r),
    system: 's',
    prompt: 'p',
    schema: { type: 'object', properties: { ok: { type: 'boolean' } } },
  });
  assert.deepEqual(data, { ok: true });
  assert.equal(reason, 'Groq rejected your API key');
  assert.ok(calls[0].startsWith('https://api.groq.com/openai/v1/chat/completions'));
  assert.ok(calls[1].includes('generativelanguage.googleapis.com'));
});

test('a working reader key is used and parses fenced JSON', async () => {
  globalThis.fetch = (async () =>
    new Response(JSON.stringify({ choices: [{ message: { content: '```json\n{"ok":true}\n```' } }] }), { status: 200 })) as typeof fetch;
  let reason: string | null = null;
  const { data, model } = await generateJSON<{ ok: boolean }>({
    reader: { provider: 'openrouter', model: 'b/thing:free', baseUrl: null, apiKey: 'k' },
    onKeyFallback: (r) => (reason = r),
    system: 's',
    prompt: 'p',
    schema: { type: 'object', properties: { ok: { type: 'boolean' } } },
  });
  assert.deepEqual(data, { ok: true });
  assert.equal(model, 'b/thing:free');
  assert.equal(reason, null);
});
