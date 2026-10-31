import type { ReaderAi } from './ai';
import { decryptSecret } from './crypto';
import { data, profiles } from './db';
import { normaliseAi, providerInfo, type AiConfig } from './providers';
import { normaliseDesign, normaliseReading, normaliseSchedule, type Profile } from './profile';
import { nextRunAfter } from './schedule';

export type ProfileRow = Omit<Profile, 'has_ai_key' | 'ai_key_error' | 'next_run_at' | 'ai'> & {
  ai: Partial<AiConfig>;
  gemini_key_enc: string | null;
  gemini_key_error: string | null;
  next_run_at: Date | null;
};

export function toProfile(row: ProfileRow): Profile {
  return {
    user_id: row.user_id,
    email: row.email,
    paper_name: row.paper_name,
    interests: row.interests,
    design: normaliseDesign(row.design),
    reading: normaliseReading(row.reading),
    schedule: normaliseSchedule(row.schedule),
    email_delivery: row.email_delivery,
    ai: normaliseAi(row.ai),
    has_ai_key: !!row.gemini_key_enc,
    ai_key_error: row.gemini_key_error ?? null,
    onboarded: row.onboarded,
    next_run_at: row.next_run_at ? new Date(row.next_run_at).toISOString() : null,
  };
}

export async function getProfileRow(userId: string): Promise<ProfileRow | undefined> {
  const snap = await profiles().doc(userId).get();
  return snap.exists ? data<ProfileRow>(snap) : undefined;
}

export async function getProfile(userId: string): Promise<Profile> {
  const row = await getProfileRow(userId);
  if (!row) throw new Error('Profile not found');
  return toProfile(row);
}

export const updateProfile = (userId: string, patch: Partial<ProfileRow> & Record<string, unknown>) =>
  profiles().doc(userId).update({ ...patch, updated_at: new Date() });

/** Recompute when this user's next scheduled edition is due. */
export async function refreshNextRun(userId: string, from = new Date()): Promise<Date | null> {
  const profile = await getProfile(userId);
  const next = profile.onboarded ? nextRunAfter(profile.schedule, from) : null;
  await profiles().doc(userId).update({ next_run_at: next });
  return next;
}

/** The reader's own AI provider + decrypted key, ready to pass to generateJSON (null = shared Gemini). */
export async function getReaderAi(userId: string): Promise<ReaderAi | null> {
  const row = await getProfileRow(userId);
  return readerAiFrom(row?.ai, row?.gemini_key_enc ?? null);
}

export function readerAiFrom(rawAi: Partial<AiConfig> | null | undefined, keyEnc: string | null): ReaderAi | null {
  const ai = normaliseAi(rawAi);
  if (ai.provider === 'shared') return null;
  const apiKey = decryptSecret(keyEnc);
  if (providerInfo(ai.provider).needsKey && !apiKey) return null;
  return { ...ai, apiKey };
}
