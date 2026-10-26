import { cookies } from 'next/headers';
import { denyUnlessAuthed, json, readJson } from '@/lib/api';
import { setPasscode } from '@/lib/auth';
import { createSessionToken, SESSION_COOKIE, SESSION_MAX_AGE } from '@/lib/session';
import { getProfile, setSetting } from '@/lib/settings';

export async function GET() {
  const denied = await denyUnlessAuthed();
  if (denied) return denied;
  return json({ profile: await getProfile() });
}

type Body = { name: string; interests: string; passcode: string };

export async function PUT(request: Request) {
  const denied = await denyUnlessAuthed();
  if (denied) return denied;
  const body = await readJson<Body>(request);
  const profile = await getProfile();
  if (typeof body.name === 'string') profile.name = body.name.trim().slice(0, 60) || 'The Morning Digest';
  if (typeof body.interests === 'string') profile.interests = body.interests.trim().slice(0, 1500);
  await setSetting('profile', profile);

  if (typeof body.passcode === 'string' && body.passcode.trim()) {
    const passcode = body.passcode.trim();
    if (passcode.length < 8) return json({ error: 'Use at least 8 characters for the passcode.' }, 400);
    const version = await setPasscode(passcode);
    // Re-issue this device's session; every other device has to sign in again.
    (await cookies()).set(SESSION_COOKIE, await createSessionToken(version), {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      path: '/',
      maxAge: SESSION_MAX_AGE,
    });
  }
  return json({ profile });
}
