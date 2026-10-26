import { createCipheriv, createDecipheriv, createHash, randomBytes } from 'node:crypto';

// Encrypts per-user secrets (their own Gemini key) at rest with a key derived from AUTH_SECRET.
function key(): Buffer {
  const secret = process.env.AUTH_SECRET;
  if (!secret) throw new Error('AUTH_SECRET is not set');
  return createHash('sha256').update(`morning-digest:${secret}`).digest();
}

export function encryptSecret(plain: string): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv('aes-256-gcm', key(), iv);
  const data = Buffer.concat([cipher.update(plain, 'utf8'), cipher.final()]);
  return [iv, cipher.getAuthTag(), data].map((b) => b.toString('base64url')).join('.');
}

export function decryptSecret(token: string | null | undefined): string | null {
  if (!token) return null;
  try {
    const [iv, tag, data] = token.split('.').map((p) => Buffer.from(p, 'base64url'));
    const decipher = createDecipheriv('aes-256-gcm', key(), iv);
    decipher.setAuthTag(tag);
    return Buffer.concat([decipher.update(data), decipher.final()]).toString('utf8');
  } catch {
    return null;
  }
}
