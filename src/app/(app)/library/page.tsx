import Link from 'next/link';
import { LocalDate } from '@/components/LocalDate';
import { SaveButton } from '@/components/StoryBits';
import { requireUser } from '@/lib/auth';
import { articles, getMany, rows, user as userDoc, type Article } from '@/lib/db';
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

  // ponytail: last 300 read/saved stories filtered in memory; full-text search needs an index service.
  let entries: Entry[] = [];
  if (tab === 'read' || tab === 'saved') {
    const me = userDoc(user.id);
    const [list, saved] = await Promise.all([
      me.collection(tab === 'read' ? 'reads' : 'saved').orderBy(tab === 'read' ? 'read_at' : 'saved_at', 'desc').limit(300).get().then((s) => rows<{ article_id: number; read_at?: Date; saved_at?: Date }>(s)),
      me.collection('saved').select().get().then((s) => new Set(s.docs.map((d) => Number(d.id)))),
    ]);
    const [arts, ledger] = await Promise.all([getMany<Article>(articles(), list.map((r) => r.article_id)), getMany<{ article_id: number; source_title: string }>(me.collection('ledger'), list.map((r) => r.article_id))]);
    const byId = new Map(arts.map((a) => [a.id, a]));
    const titles = new Map(ledger.map((l) => [l.article_id, l.source_title]));
    const needle = q.toLowerCase();
    entries = list
      .map((r): Entry | null => {
        const a = byId.get(r.article_id);
        if (!a) return null;
        return { id: a.id, title: a.title, url: a.url, source_title: titles.get(a.id) ?? a.source_title, tldr: a.tldr, at: (r.read_at ?? r.saved_at)!, saved: saved.has(a.id) };
      })
      .filter((e): e is Entry => !!e && (!needle || `${e.title} ${e.tldr ?? ''} ${e.source_title}`.toLowerCase().includes(needle)));
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
