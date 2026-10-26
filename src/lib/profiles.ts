import { sql } from './db';
import { normaliseDesign, normaliseReading, normaliseSchedule, type Profile } from './profile';
import { nextRunAfter } from './schedule';

type ProfileRow = Omit<Profile, 'has_gemini_key' | 'next_run_at'> & { gemini_key_enc: string | null; next_run_at: Date | null };

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
    has_gemini_key: !!row.gemini_key_enc,
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
