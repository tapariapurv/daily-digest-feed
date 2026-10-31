import { json, readJson, withUser } from '@/lib/api';
import { AiError, listModels } from '@/lib/ai';
import { decryptSecret, encryptSecret } from '@/lib/crypto';
import { normaliseDesign, normaliseReading, normaliseSchedule, type Design, type Reading, type Schedule } from '@/lib/profile';
import { getProfile, getProfileRow, refreshNextRun, updateProfile } from '@/lib/profiles';
import { normaliseAi, providerInfo, type AiConfig } from '@/lib/providers';

export const maxDuration = 30;

export const GET = withUser(async (user) => json({ profile: await getProfile(user.id) }));

type Body = {
  paper_name: string;
  interests: string;
  design: Partial<Design>;
  reading: Partial<Reading>;
  schedule: Partial<Schedule>;
  email_delivery: boolean;
  ai: Partial<AiConfig>;
  /** A newly pasted key for the chosen provider (omit to keep the saved one). */
  ai_key: string;
  onboarded: boolean;
};

export const PUT = withUser(async (user, request) => {
  const body = await readJson<Body>(request);
  const current = await getProfile(user.id);

  if (body.ai) {
    const ai = normaliseAi(body.ai);
    if (ai.provider === 'shared') {
      await updateProfile(user.id, { ai, gemini_key_enc: null, gemini_key_error: null });
    } else {
      const row = await getProfileRow(user.id);
      const typed = typeof body.ai_key === 'string' ? body.ai_key.trim() : '';
      const sameProvider = normaliseAi(row?.ai).provider === ai.provider;
      const apiKey = typed || (sameProvider ? decryptSecret(row?.gemini_key_enc) : null);
      if (!apiKey && providerInfo(ai.provider).needsKey) return json({ error: `Paste your ${providerInfo(ai.provider).name} API key.` }, 400);
      // Verify the key (and that the chosen model exists) before saving anything.
      let models: string[];
      try {
        models = await listModels({ ...ai, apiKey });
      } catch (err) {
        return json({ error: err instanceof AiError ? err.message : 'Couldn’t check that key.' }, 400);
      }
      if (!ai.model) return json({ error: 'Choose a model.' }, 400);
      if (models.length && !models.includes(ai.model)) return json({ error: `That key can’t use “${ai.model}”. Pick one from the list.` }, 400);
      await updateProfile(user.id, { ai, gemini_key_enc: apiKey ? encryptSecret(apiKey) : null, gemini_key_error: null });
    }
  }

  const next = {
    paper_name: typeof body.paper_name === 'string' ? body.paper_name.trim().slice(0, 60) || 'The Morning Digest' : current.paper_name,
    interests: typeof body.interests === 'string' ? body.interests.trim().slice(0, 1500) : current.interests,
    design: body.design ? normaliseDesign({ ...current.design, ...body.design }) : current.design,
    reading: body.reading ? normaliseReading({ ...current.reading, ...body.reading }) : current.reading,
    schedule: body.schedule ? normaliseSchedule({ ...current.schedule, ...body.schedule }) : current.schedule,
    email_delivery: typeof body.email_delivery === 'boolean' ? body.email_delivery : current.email_delivery,
    onboarded: body.onboarded === true ? true : current.onboarded,
  };
  await updateProfile(user.id, next);
  await refreshNextRun(user.id);
  return json({ profile: await getProfile(user.id) });
});
