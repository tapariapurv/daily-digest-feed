import { json } from '@/lib/api';
import { sql } from '@/lib/db';
import { mailConfigured } from '@/lib/mailer';

export const dynamic = 'force-dynamic';

// Public, secret-free status check used for deployment verification.
export async function GET() {
  const checks: Record<string, string> = {
    gemini: process.env.GEMINI_API_KEY ? 'configured' : 'missing',
    cron: process.env.CRON_SECRET ? 'configured' : 'missing',
    email: mailConfigured() ? 'configured' : 'not configured',
  };
  try {
    const [row] = await sql<{ users: number; editions: number }[]>`
      select (select count(*)::int from app.profiles) as users, (select count(*)::int from app.editions) as editions`;
    checks.database = `ok (${row.users} readers, ${row.editions} editions)`;
  } catch (err) {
    checks.database = `error: ${err instanceof Error ? err.message : String(err)}`;
  }
  return json(checks, checks.database.startsWith('ok') ? 200 : 503);
}
