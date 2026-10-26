// Pure helpers shared by server and client components.

export function timeAgo(date: Date | string | null | undefined): string {
  if (!date) return '';
  const diff = Date.now() - new Date(date).getTime();
  const m = Math.round(diff / 60_000);
  if (m < 1) return 'just now';
  if (m < 60) return `${m}m ago`;
  const h = Math.round(m / 60);
  if (h < 24) return `${h}h ago`;
  const d = Math.round(h / 24);
  if (d < 14) return `${d}d ago`;
  return new Date(date).toLocaleDateString('en', { month: 'short', day: 'numeric' });
}

export function hostname(url: string | null | undefined): string {
  if (!url) return '';
  try {
    return new URL(url).hostname.replace(/^www\./, '');
  } catch {
    return '';
  }
}
