'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { IconDesign, IconLibrary, IconSettings, IconSources, IconToday } from './Icons';
import { RunButton, RunStatus } from './RunButton';

const LINKS = [
  { href: '/', label: 'Today', icon: IconToday },
  { href: '/library', label: 'Library', icon: IconLibrary },
  { href: '/sources', label: 'Sources', icon: IconSources },
  { href: '/design', label: 'Design', icon: IconDesign },
  { href: '/settings', label: 'Settings', icon: IconSettings },
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
            <Link key={l.href} href={l.href} className="navlink" aria-current={isActive(l.href) ? 'page' : undefined}>
              {l.label}
            </Link>
          ))}
          <RunButton />
        </nav>
      </header>
      <RunStatus />
      <nav className="bottomnav" aria-label="Main">
        {LINKS.map((l) => (
          <Link key={l.href} href={l.href} aria-current={isActive(l.href) ? 'page' : undefined}>
            <l.icon />
            {l.label}
          </Link>
        ))}
      </nav>
    </>
  );
}
