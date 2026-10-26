import type { ReactNode } from 'react';
import type { Profile } from '@/lib/profile';
import { Paper } from './Paper';
import { TopBar } from './TopBar';

export function AppShell({ profile, children, narrow }: { profile: Profile; children: ReactNode; narrow?: boolean }) {
  return (
    <Paper design={profile.design}>
      <div className={`shell${narrow ? ' narrow' : ''}`}>
        <TopBar name={profile.paper_name} />
        <main>{children}</main>
      </div>
    </Paper>
  );
}
