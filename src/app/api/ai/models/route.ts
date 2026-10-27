import { json, readJson, withUser } from '@/lib/api';
import { AiError, listModels } from '@/lib/ai';
import { getProfileRow } from '@/lib/profiles';
import { decryptSecret } from '@/lib/crypto';
import { normaliseAi, pickDefaultModel, providerInfo, type AiConfig } from '@/lib/providers';

export const maxDuration = 30;

type Body = { provider: AiConfig['provider']; baseUrl: string; ai_key: string };

/** Check a key and list the models it can use (uses the saved key when none is typed). */
export const POST = withUser(async (user, request) => {
  const body = await readJson<Body>(request);
  const ai = normaliseAi({ provider: body.provider, baseUrl: body.baseUrl ?? null, model: null });
  if (ai.provider === 'shared') return json({ models: [], defaultModel: null });
  const row = await getProfileRow(user.id);
  const sameProvider = normaliseAi(row?.ai).provider === ai.provider;
  const apiKey = (typeof body.ai_key === 'string' && body.ai_key.trim()) || (sameProvider ? decryptSecret(row?.gemini_key_enc) : null);
  if (!apiKey && providerInfo(ai.provider).needsKey) return json({ error: 'Paste your API key first.' }, 400);
  try {
    const models = await listModels({ ...ai, apiKey });
    return json({ models, defaultModel: pickDefaultModel(ai.provider, models) });
  } catch (err) {
    return json({ error: err instanceof AiError ? err.message : 'Couldn’t check that key.' }, 400);
  }
});
