import type { ReaderAi } from './ai';
import { decryptSecret } from './crypto';
import { sql } from './db';
import { normaliseAi, providerInfo, type AiConfig } from './providers';
import { normaliseDesign, normaliseReading, normaliseSchedule, type Profile } from './profile';
import { nextRunAfter } from './schedule';

type ProfileRow = Omit<Profile, 'has_ai_key' | 'ai_key_error' | 'next_run_at' | 'ai'> & {
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
    ai_key_error: row.gemini_key_error,
    onboarded: row.onboarded,
    next_run_at: row.next_run_at ? new Date(row.next_run_at).toISOString() : null,
  };
}

export async function getProfile(userId: string): Promise<Profile> {
  const [row] = await sql<ProfileRow[]>`select * from app.profiles where user_id = ${userId}`;
  if (!row) throw new Error('Profile not found');
  return toProfile(row);
}

export async function getProfileRow(userId: string): Promise<ProfileRow | undefined> {
  const [row] = await sql<ProfileRow[]>`select * from app.profiles where user_id = ${userId}`;
  return row;
}

/** Recompute when this user's next scheduled edition is due. */
export async function refreshNextRun(userId: string, from = new Date()): Promise<Date | null> {
  const profile = await getProfile(userId);
  const next = profile.onboarded ? nextRunAfter(profile.schedule, from) : null;
  await sql`update app.profiles set next_run_at = ${next} where user_id = ${userId}`;
  return next;
}

/** The reader's own AI provider + decrypted key, ready to pass to generateJSON (null = shared Gemini). */
export async function getReaderAi(userId: string): Promise<ReaderAi | null> {
  const [row] = await sql<{ ai: Partial<AiConfig>; gemini_key_enc: string | null }[]>`
    select ai, gemini_key_enc from app.profiles where user_id = ${userId}`;
  return readerAiFrom(row?.ai, row?.gemini_key_enc ?? null);
}

export function readerAiFrom(rawAi: Partial<AiConfig> | null | undefined, keyEnc: string | null): ReaderAi | null {
  const ai = normaliseAi(rawAi);
  if (ai.provider === 'shared') return null;
  const apiKey = decryptSecret(keyEnc);
  if (providerInfo(ai.provider).needsKey && !apiKey) return null;
  return { ...ai, apiKey };
}
