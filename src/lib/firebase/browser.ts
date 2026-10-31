'use client';

import { getApps, initializeApp } from 'firebase/app';
import { getAuth } from 'firebase/auth';
import { FIREBASE_CONFIG } from './config';

export const browserAuth = () => getAuth(getApps()[0] ?? initializeApp(FIREBASE_CONFIG));

/** Trade a fresh Firebase ID token for the server's httpOnly session cookie. */
export async function startSession(idToken: string) {
  const res = await fetch('/api/session', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ idToken }) });
  if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error ?? 'Couldn’t start your session.');
}

export async function endSession() {
  await fetch('/api/session', { method: 'DELETE' });
  await browserAuth().signOut().catch(() => {});
}
