import { cookies } from 'next/headers';
import { json, readJson } from '@/lib/api';
import { adminAuth } from '@/lib/db';
import { SESSION_COOKIE } from '@/lib/firebase/config';

const DAYS = 14;

/** Exchange a just-minted Firebase ID token for an httpOnly session cookie. */
export async function POST(request: Request) {
  const { idToken } = await readJson<{ idToken: string }>(request);
  if (typeof idToken !== 'string') return json({ error: 'Missing token' }, 400);
  try {
    const decoded = await adminAuth().verifyIdToken(idToken);
    if (Date.now() / 1000 - decoded.auth_time > 5 * 60) return json({ error: 'Please sign in again.' }, 401);
    const value = await adminAuth().createSessionCookie(idToken, { expiresIn: DAYS * 86400_000 });
    (await cookies()).set(SESSION_COOKIE, value, { httpOnly: true, secure: true, sameSite: 'lax', path: '/', maxAge: DAYS * 86400 });
    return json({ ok: true });
  } catch (err) {
    console.error('session', err);
    return json({ error: 'Couldn’t verify your sign-in.' }, 401);
  }
}

export async function DELETE() {
  (await cookies()).delete(SESSION_COOKIE);
  return json({ ok: true });
}
