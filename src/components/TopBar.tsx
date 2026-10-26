'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { RunButton, RunStatus } from './RunButton';

const LINKS = [
  { href: '/', label: 'Today' },
  { href: '/archive', label: 'Archive' },
  { href: '/sources', label: 'Sources' },
  { href: '/settings', label: 'Settings' },
];

export function TopBar({ name }: { name: string }) {
  const pathname = usePathname();
  const isActive = (href: string) => (href === '/' ? pathname === '/' || pathname.startsWith('/e/') : pathname.startsWith(href));
  return (
    <>
      <header className="topbar">
        <Link href="/" className="wordmark">
          {name}
        </Link>
        <nav aria-label="Main">
          {LINKS.map((l) => (
            <Link key={l.href} href={l.href} aria-current={isActive(l.href) ? 'page' : undefined}>
              {l.label}
            </Link>
          ))}
          <RunButton />
        </nav>
      </header>
      <RunStatus />
    </>
  );
}
