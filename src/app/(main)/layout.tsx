import { redirect } from 'next/navigation';
import { TopBar } from '@/components/TopBar';
import { isAuthenticated } from '@/lib/auth';
import { getProfile } from '@/lib/settings';

export const dynamic = 'force-dynamic';

export default async function MainLayout({ children }: { children: React.ReactNode }) {
  if (!(await isAuthenticated())) redirect('/login');
  const profile = await getProfile();
  return (
    <div className="shell">
      <TopBar name={profile.name} />
      <main>{children}</main>
    </div>
  );
}
