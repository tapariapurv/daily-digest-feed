import { randomBytes, scryptSync, timingSafeEqual } from 'node:crypto';
import { cookies } from 'next/headers';
import { getSetting, setSetting } from './settings.ts';
import { SESSION_COOKIE, verifySessionToken } from './session.ts';

type StoredPasscode = { hash: string; salt: string; version: string };

function hash(passcode: string, salt: string): Buffer {
  return scryptSync(passcode, salt, 32);
}

/**
 * The passcode set in Settings wins; until then APP_PASSCODE from the environment is used.
 * Returns the passcode "version" (used to invalidate old sessions) when correct, else null.
 */
export async function checkPasscode(input: string): Promise<string | null> {
  const stored = await getSetting<StoredPasscode>('passcode');
  if (stored) {
    const ok = timingSafeEqual(hash(input, stored.salt), Buffer.from(stored.hash, 'hex'));
    return ok ? stored.version : null;
  }
  const envPass = process.env.APP_PASSCODE;
  if (!envPass) return null;
  const a = hash(input, 'env');
  const b = hash(envPass, 'env');
  return timingSafeEqual(a, b) ? 'env' : null;
}

export async function currentPasscodeVersion(): Promise<string> {
  return (await getSetting<StoredPasscode>('passcode'))?.version ?? 'env';
}

export async function setPasscode(passcode: string): Promise<string> {
  const salt = randomBytes(16).toString('hex');
  const version = randomBytes(6).toString('hex');
  await setSetting('passcode', { hash: hash(passcode, salt).toString('hex'), salt, version });
  return version;
}

/** Full check for route handlers: valid signature AND the passcode hasn't been changed since login. */
export async function isAuthenticated(): Promise<boolean> {
  const version = await verifySessionToken((await cookies()).get(SESSION_COOKIE)?.value);
  return version !== null && version === (await currentPasscodeVersion());
}
