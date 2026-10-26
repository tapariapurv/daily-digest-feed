const base = { width: 24, height: 24, viewBox: '0 0 24 24', fill: 'none', stroke: 'currentColor', strokeWidth: 1.6, strokeLinecap: 'round', strokeLinejoin: 'round' } as const;

export const IconToday = () => (
  <svg {...base} aria-hidden>
    <path d="M4 5h13a3 3 0 0 1 3 3v11H7a3 3 0 0 1-3-3V5Z" />
    <path d="M8 9h8M8 12.5h8M8 16h5" />
  </svg>
);
export const IconLibrary = () => (
  <svg {...base} aria-hidden>
    <path d="M5 4v16M9.5 4v16M14 5l4.5 14.5" />
  </svg>
);
export const IconSources = () => (
  <svg {...base} aria-hidden>
    <path d="M5 19a1 1 0 1 0 0-2 1 1 0 0 0 0 2Z" />
    <path d="M4 11a9 9 0 0 1 9 9M4 4a16 16 0 0 1 16 16" />
  </svg>
);
export const IconDesign = () => (
  <svg {...base} aria-hidden>
    <path d="M12 3a9 9 0 1 0 0 18c1.2 0 1.8-.9 1.4-1.9-.4-1 .3-2.1 1.4-2.1H17a4 4 0 0 0 4-4c0-5.5-4-10-9-10Z" />
    <circle cx="7.5" cy="11" r="1.2" />
    <circle cx="10.5" cy="7" r="1.2" />
    <circle cx="15" cy="7.5" r="1.2" />
  </svg>
);
export const IconSettings = () => (
  <svg {...base} aria-hidden>
    <path d="M4 7h10M18 7h2M4 17h4M12 17h8" />
    <circle cx="16" cy="7" r="2" />
    <circle cx="10" cy="17" r="2" />
  </svg>
);
export const IconBookmark = ({ filled }: { filled?: boolean }) => (
  <svg {...base} aria-hidden fill={filled ? 'currentColor' : 'none'}>
    <path d="M6.5 4h11v16l-5.5-4-5.5 4V4Z" />
  </svg>
);
