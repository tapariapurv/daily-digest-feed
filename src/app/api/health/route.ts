import { json } from '@/lib/api';
import { sql } from '@/lib/db';

export const dynamic = 'force-dynamic';

// Public, secret-free status check used for deployment verification.
export async function GET() {
  const checks: Record<string, string> = {
    gemini: process.env.GEMINI_API_KEY ? 'configured' : 'missing',
    auth: process.env.AUTH_SECRET ? 'configured' : 'missing',
    cron: process.env.CRON_SECRET ? 'configured' : 'missing',
  };
  try {
    const [row] = await sql<{ n: number }[]>`select count(*)::int as n from sources`;
    checks.database = `ok (${row.n} sources)`;
  } catch (err) {
    checks.database = `error: ${err instanceof Error ? err.message : String(err)}`;
  }
  return json(checks, checks.database.startsWith('ok') ? 200 : 503);
}
