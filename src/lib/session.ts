// Edge/Node-safe session tokens (Web Crypto only) — used by proxy.ts and route handlers.

export const SESSION_COOKIE = 'dd_session';
export const SESSION_MAX_AGE = 365 * 24 * 3600;

function b64url(bytes: ArrayBuffer): string {
  let s = '';
  for (const b of new Uint8Array(bytes)) s += String.fromCharCode(b);
  return btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

async function sign(payload: string): Promise<string> {
  const secret = process.env.AUTH_SECRET;
  if (!secret) throw new Error('AUTH_SECRET is not set');
  const key = await crypto.subtle.importKey('raw', new TextEncoder().encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  return b64url(await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(payload)));
}

export async function createSessionToken(version: string): Promise<string> {
  const payload = `${Math.floor(Date.now() / 1000) + SESSION_MAX_AGE}.${version}`;
  return `${payload}.${await sign(payload)}`;
}

/** Returns the passcode version embedded in a valid token, or null. */
export async function verifySessionToken(token: string | undefined): Promise<string | null> {
  if (!token) return null;
  const [exp, version, sig] = token.split('.');
  if (!exp || !version || !sig || Number(exp) * 1000 < Date.now()) return null;
  const expected = await sign(`${exp}.${version}`);
  if (expected.length !== sig.length) return null;
  let diff = 0;
  for (let i = 0; i < sig.length; i++) diff |= sig.charCodeAt(i) ^ expected.charCodeAt(i);
  return diff === 0 ? version : null;
}
