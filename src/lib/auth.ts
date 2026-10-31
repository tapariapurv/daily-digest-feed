import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import { cache } from 'react';
import { adminAuth, profiles } from './db';
import { SESSION_COOKIE } from './firebase/config';
import { DEFAULT_DESIGN, DEFAULT_READING, DEFAULT_SCHEDULE } from './profile';

export type SessionUser = { id: string; email: string | null };

/** The verified signed-in user for this request, or null. Cached per request. */
export const getSessionUser = cache(async (): Promise<SessionUser | null> => {
  const cookie = (await cookies()).get(SESSION_COOKIE)?.value;
  if (!cookie) return null;
  const claims = await adminAuth().verifySessionCookie(cookie).catch(() => null);
  if (!claims) return null;
  const user = { id: claims.uid, email: claims.email ?? null };
  // First visit after sign-up: create the profile.
  const ref = profiles().doc(user.id);
  const snap = await ref.get();
  if (!snap.exists) {
    await ref.set({
      user_id: user.id, email: user.email, paper_name: 'The Morning Digest', interests: '',
      design: DEFAULT_DESIGN, reading: DEFAULT_READING, schedule: DEFAULT_SCHEDULE, email_delivery: false,
      ai: {}, gemini_key_enc: null, gemini_key_error: null, onboarded: false, next_run_at: null,
      created_at: new Date(), updated_at: new Date(),
    });
  } else if (snap.get('email') !== user.email) await ref.update({ email: user.email });
  return user;
});

export async function requireUser(): Promise<SessionUser> {
  const user = await getSessionUser();
  if (!user) redirect('/login');
  return user;
}
