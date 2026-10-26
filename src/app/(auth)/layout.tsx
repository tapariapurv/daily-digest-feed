import Link from 'next/link';
import { Paper } from '@/components/Paper';

export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <Paper>
      <div className="shell narrow">
        <header className="topbar">
          <Link href="/" className="wordmark">
            Morning Digest
          </Link>
        </header>
        <main className="auth-card reveal">{children}</main>
      </div>
    </Paper>
  );
}
