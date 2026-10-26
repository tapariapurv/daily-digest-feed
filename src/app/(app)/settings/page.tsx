import { SettingsForm } from '@/components/SettingsForm';
import { requireUser } from '@/lib/auth';
import { sql, type Run } from '@/lib/db';
import { mailConfigured } from '@/lib/mailer';
import { getProfile } from '@/lib/profiles';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'Settings' };

export default async function SettingsPage() {
  const user = await requireUser();
  const [profile, runs] = await Promise.all([
    getProfile(user.id),
    sql<Run[]>`select * from app.runs where user_id = ${user.id} order by started_at desc limit 8`,
  ]);
  return (
    <div className="reveal">
      <div className="page-head">
        <div>
          <h1 className="page-title">Settings</h1>
          <p className="lede">When your paper arrives, where it goes, and what it should care about.</p>
        </div>
      </div>
      <SettingsForm initial={profile} mailReady={mailConfigured()} runs={JSON.parse(JSON.stringify(runs))} />
    </div>
  );
}
