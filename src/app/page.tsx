import { redirect } from 'next/navigation';
import { Suspense } from 'react';
import { AppShell } from '@/components/AppShell';
import { Landing } from '@/components/Landing';
import { PageSkeleton } from '@/components/PageSkeleton';
import { Today } from '@/components/Today';
import { getSessionUser } from '@/lib/auth';
import { getProfile } from '@/lib/profiles';

export const dynamic = 'force-dynamic';

export default async function Home() {
  const user = await getSessionUser();
  if (!user) return <Landing />;
  const profile = await getProfile(user.id);
  if (!profile.onboarded) redirect('/welcome');
  return (
    <AppShell profile={profile}>
      <Suspense fallback={<PageSkeleton />}>
        <Today profile={profile} />
      </Suspense>
    </AppShell>
  );
}
