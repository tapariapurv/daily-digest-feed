import { cookies } from 'next/headers';
import { json, readJson } from '@/lib/api';
import { checkPasscode } from '@/lib/auth';
import { createSessionToken, SESSION_COOKIE, SESSION_MAX_AGE } from '@/lib/session';

export async function POST(request: Request) {
  const { passcode } = await readJson<{ passcode: string }>(request);
  const version = typeof passcode === 'string' && passcode ? await checkPasscode(passcode.trim()) : null;
  if (!version) {
    await new Promise((r) => setTimeout(r, 1200)); // slow down guessing
    return json({ error: 'That passcode isn’t right.' }, 401);
  }
  (await cookies()).set(SESSION_COOKIE, await createSessionToken(version), {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    path: '/',
    maxAge: SESSION_MAX_AGE,
  });
  return json({ ok: true });
}
