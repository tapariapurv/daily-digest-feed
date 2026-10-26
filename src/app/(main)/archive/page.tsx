import Link from 'next/link';
import { LocalDate } from '@/components/LocalDate';
import { listEditions } from '@/lib/editions';

export const dynamic = 'force-dynamic';

export default async function ArchivePage() {
  const editions = await listEditions();
  return (
    <section className="reveal">
      <div className="masthead">
        <div className="masthead-inner">
          <h1 className="page-title">Archive</h1>
          <p className="lede">Every edition, newest first.</p>
        </div>
      </div>
      {editions.length ? (
        <ul className="archive">
          {editions.map((e) => (
            <li key={e.id}>
              <Link href={`/e/${e.id}`}>
                <span className="mono muted">
                  <LocalDate iso={new Date(e.created_at).toISOString()} format="short" />
                </span>
                <span>
                  <span className="archive-headline">{e.headline ?? 'Edition'}</span>
                  <span className="mono muted" style={{ display: 'block', marginTop: '0.3rem' }}>
                    {e.item_count} stories · {e.source_count} sources
                  </span>
                </span>
              </Link>
            </li>
          ))}
        </ul>
      ) : (
        <p className="muted">No editions yet.</p>
      )}
    </section>
  );
}
