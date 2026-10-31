import Link from 'next/link';
import { Paper } from '@/components/Paper';

const HEADLINES = [
  ['Technology', 'The quiet chip shortage nobody priced in'],
  ['Good News', 'A city cut traffic deaths to zero for a full year'],
  ['Science', 'Why the newest telescope keeps finding “impossible” galaxies'],
];

export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <Paper>
      <div className="auth-split">
        <div className="auth-pane">
          <header className="topbar">
            <Link href="/" className="wordmark">
              Morning Digest
            </Link>
          </header>
          <main className="auth-card reveal">{children}</main>
        </div>
        <aside className="auth-art" aria-hidden>
          <div className="auth-paper">
            <p className="meta">Saturday edition · 7 min read</p>
            <p className="auth-paper-title">Good morning.</p>
            {HEADLINES.map(([topic, title], i) => (
              <div key={topic} className="auth-paper-story" style={{ animationDelay: `${0.25 + i * 0.12}s` }}>
                <span className="meta">{topic}</span>
                <strong>{title}</strong>
                <i />
                <i />
              </div>
            ))}
          </div>
        </aside>
      </div>
    </Paper>
  );
}
