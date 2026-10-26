import { redirect } from 'next/navigation';
import { AppShell } from '@/components/AppShell';
import { requireUser } from '@/lib/auth';
import { getProfile } from '@/lib/profiles';

export const dynamic = 'force-dynamic';

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const user = await requireUser();
  const profile = await getProfile(user.id);
  if (!profile.onboarded) redirect('/welcome');
  return <AppShell profile={profile}>{children}</AppShell>;
}
