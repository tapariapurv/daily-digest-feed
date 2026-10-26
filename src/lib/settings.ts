import { sql } from './db.ts';

export type Profile = {
  /** Masthead name. */
  name: string;
  /** Free-text description of what the reader cares about; steers ranking. */
  interests: string;
};

export const DEFAULT_PROFILE: Profile = { name: 'The Morning Digest', interests: '' };

export async function getSetting<T>(key: string): Promise<T | null> {
  const rows = await sql<{ value: T }[]>`select value from settings where key = ${key}`;
  return rows[0]?.value ?? null;
}

export async function setSetting(key: string, value: unknown): Promise<void> {
  await sql`
    insert into settings (key, value, updated_at) values (${key}, ${sql.json(value as never)}, now())
    on conflict (key) do update set value = excluded.value, updated_at = now()`;
}

export async function getProfile(): Promise<Profile> {
  return { ...DEFAULT_PROFILE, ...((await getSetting<Partial<Profile>>('profile')) ?? {}) };
}
