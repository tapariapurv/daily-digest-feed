import { redirect } from 'next/navigation';
import { Onboarding } from '@/components/Onboarding';
import { Paper } from '@/components/Paper';
import { requireUser } from '@/lib/auth';
import { getProfile } from '@/lib/profiles';
import { SAMPLE_EDITION } from '@/lib/sample';
import { mailboxConfigured } from '@/lib/mailbox';
import { listSources } from '@/lib/sources';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'Welcome' };

export default async function WelcomePage() {
  const user = await requireUser();
  const [profile, sources] = await Promise.all([getProfile(user.id), listSources(user.id)]);
  if (profile.onboarded) redirect('/');
  return (
    <Paper design={profile.design}>
      <div className="shell">
        <header className="topbar">
          <span className="wordmark">{profile.paper_name}</span>
        </header>
        <Onboarding profile={profile} sources={sources} sample={SAMPLE_EDITION} inboxReady={mailboxConfigured()} />
      </div>
    </Paper>
  );
}
