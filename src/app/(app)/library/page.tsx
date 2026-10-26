import Link from 'next/link';
import { LocalDate } from '@/components/LocalDate';
import { SaveButton } from '@/components/StoryBits';
import { requireUser } from '@/lib/auth';
import { sql } from '@/lib/db';
import { listEditions } from '@/lib/editions';
import { timeAgo } from '@/lib/format';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'Library' };

type Entry = { id: number; title: string; url: string; source_title: string; tldr: string | null; at: Date; saved: boolean };

const TABS = [
  { id: 'read', label: 'Read history' },
  { id: 'saved', label: 'Saved' },
  { id: 'editions', label: 'Past editions' },
] as const;

export default async function LibraryPage({ searchParams }: { searchParams: Promise<{ tab?: string; q?: string }> }) {
  const user = await requireUser();
  const sp = await searchParams;
  const tab = TABS.some((t) => t.id === sp.tab) ? (sp.tab as (typeof TABS)[number]['id']) : 'read';
  const q = (sp.q ?? '').trim().slice(0, 100);
  const like = `%${q.replace(/[%_\\]/g, (m) => `\\${m}`)}%`;

  let entries: Entry[] = [];
  if (tab === 'read') {
    entries = await sql<Entry[]>`
      select a.id, a.title, a.url, coalesce(ua.source_title, a.source_title) as source_title, a.tldr, r.read_at as at,
        exists (select 1 from app.saved s where s.user_id = r.user_id and s.article_id = a.id) as saved
      from app.reads r join app.articles a on a.id = r.article_id
      left join app.user_articles ua on ua.user_id = r.user_id and ua.article_id = a.id
      where r.user_id = ${user.id} and (${q} = '' or a.title ilike ${like} or a.tldr ilike ${like} or ua.source_title ilike ${like})
      order by r.read_at desc limit 300`;
  } else if (tab === 'saved') {
    entries = await sql<Entry[]>`
      select a.id, a.title, a.url, coalesce(ua.source_title, a.source_title) as source_title, a.tldr, s.saved_at as at, true as saved
      from app.saved s join app.articles a on a.id = s.article_id
      left join app.user_articles ua on ua.user_id = s.user_id and ua.article_id = a.id
      where s.user_id = ${user.id} and (${q} = '' or a.title ilike ${like} or a.tldr ilike ${like} or ua.source_title ilike ${like})
      order by s.saved_at desc limit 300`;
  }
  const editions = tab === 'editions' ? await listEditions(user.id) : [];

  // Group by calendar day (UTC on the server; LocalDate renders it in the reader's zone).
  const groups = new Map<string, Entry[]>();
  for (const e of entries) {
    const key = new Date(e.at).toISOString().slice(0, 10);
    groups.set(key, [...(groups.get(key) ?? []), e]);
  }

  return (
    <div className="reveal">
      <div className="page-head">
        <div>
          <h1 className="page-title">Library</h1>
          <p className="lede">Everything you’ve opened, everything you saved, and every past edition.</p>
        </div>
      </div>
      <nav className="tabs" aria-label="Library sections">
        {TABS.map((t) => (
          <Link key={t.id} href={`/library?tab=${t.id}`} aria-current={tab === t.id ? 'page' : undefined}>
            {t.label}
          </Link>
        ))}
      </nav>

      {tab !== 'editions' && (
        <form className="row" style={{ marginBottom: '0.5rem' }}>
          <input type="hidden" name="tab" value={tab} />
          <input type="text" name="q" defaultValue={q} placeholder="Search titles, takeaways, sources…" aria-label="Search" style={{ flex: 1 }} />
          <button className="btn" type="submit">
            Search
          </button>
        </form>
      )}

      {tab === 'editions' ? (
        editions.length ? (
          <ul className="archive">
            {editions.map((e) => (
              <li key={e.id}>
                <Link href={`/e/${e.id}`}>
                  <span className="meta">
                    <LocalDate iso={new Date(e.created_at).toISOString()} format="short" />
                  </span>
                  <span>
                    <span className="archive-headline">{e.headline ?? 'Edition'}</span>
                    <span className="meta" style={{ display: 'block', marginTop: '0.3rem' }}>
                      {e.item_count} stories · {e.source_count} sources
                    </span>
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        ) : (
          <p className="muted">No editions yet.</p>
        )
      ) : entries.length ? (
        [...groups.entries()].map(([day, list]) => (
          <section key={day}>
            <p className="day-label">
              <LocalDate iso={`${day}T12:00:00.000Z`} format="long" />
            </p>
            <ul className="history-list">
              {list.map((e) => (
                <li key={e.id} className="history-item">
                  <div>
                    <a className="title" href={`/r/${e.id}`} target="_blank" rel="noopener noreferrer">
                      {e.title}
                    </a>
                    <div className="meta" style={{ marginTop: '0.2rem' }}>
                      {e.source_title} · {tab === 'read' ? 'read' : 'saved'} {timeAgo(e.at)}
                    </div>
                    {e.tldr && <p>{e.tldr}</p>}
                  </div>
                  <SaveButton articleId={e.id} initial={e.saved} />
                </li>
              ))}
            </ul>
          </section>
        ))
      ) : (
        <p className="muted" style={{ marginTop: '2rem' }}>
          {q
            ? 'Nothing matches that search.'
            : tab === 'read'
              ? 'Stories you open from your paper will appear here.'
              : 'Tap the bookmark on any story to keep it here.'}
        </p>
      )}
    </div>
  );
}
