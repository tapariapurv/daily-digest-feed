import { json } from '@/lib/api';
import { profiles } from '@/lib/db';
import { mailConfigured } from '@/lib/mailer';

export const dynamic = 'force-dynamic';

// Public, secret-free status check used for deployment verification.
export async function GET() {
  const checks: Record<string, string> = {
    gemini: process.env.GEMINI_API_KEY ? 'configured' : 'missing',
    firebase: process.env.FIREBASE_SERVICE_ACCOUNT ? 'configured' : 'missing',
    email: mailConfigured() ? 'configured' : 'not configured',
  };
  try {
    const users = (await profiles().count().get()).data().count;
    checks.database = `ok (${users} readers)`;
  } catch (err) {
    checks.database = `error: ${err instanceof Error ? err.message : String(err)}`;
  }
  return json(checks, checks.database.startsWith('ok') ? 200 : 503);
}
