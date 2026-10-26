import { NextResponse } from 'next/server';
import { isAuthenticated } from './auth.ts';

export function json(data: unknown, status = 200) {
  return NextResponse.json(data, { status, headers: { 'cache-control': 'no-store' } });
}

/** Returns a 401 response when the caller isn't signed in with the current passcode, else null. */
export async function denyUnlessAuthed(): Promise<NextResponse | null> {
  return (await isAuthenticated()) ? null : json({ error: 'Not signed in' }, 401);
}

export async function readJson<T>(request: Request): Promise<Partial<T>> {
  try {
    return (await request.json()) as Partial<T>;
  } catch {
    return {};
  }
}
