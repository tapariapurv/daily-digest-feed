import Link from 'next/link';
import { Edition } from '@/components/Edition';
import { AutoRun } from '@/components/RunButton';
import { sql, type Run } from '@/lib/db';
import { getEditionView } from '@/lib/editions';

export const dynamic = 'force-dynamic';

const HOUR = 3600_000;

export default async function TodayPage() {
  const [[{ n: sourceCount }], view, [lastRun]] = await Promise.all([
    sql<{ n: number }[]>`select count(*)::int as n from sources where enabled`,
    getEditionView(),
    sql<Run[]>`select * from runs order by started_at desc limit 1`,
  ]);

  if (!sourceCount && !view) {
    return (
      <section className="empty masthead reveal">
        <div className="masthead-inner">
          <p className="dateline">
            <span>Welcome</span>
          </p>
          <h1 className="headline">Everything you follow, in one calm morning read.</h1>
          <p className="intro">
            Paste the blogs, feeds, newsletters and channels you subscribe to. Each morning this page fetches what’s new, summarises every piece in a
            few sentences, groups it by topic, and never shows you the same story twice.
          </p>
          <ol className="steps">
            <li>Add your sources — homepages work; the feed is found for you.</li>
            <li>Optionally tell it what you care about in Settings, so the important stories rise to the top.</li>
            <li>Read your first edition in about a minute. New editions arrive every morning on their own.</li>
          </ol>
          <Link href="/sources" className="btn btn-primary">
            Add your sources →
          </Link>
        </div>
      </section>
    );
  }

  if (!view) {
    const working = lastRun?.status === 'running';
    return (
      <section className="empty masthead reveal">
        <div className="masthead-inner">
          <p className="dateline">
            <span>Edition No. 1</span>
          </p>
          <h1 className="headline">Your first edition is on the press.</h1>
          <p className="intro">
            Reading {sourceCount} source{sourceCount === 1 ? '' : 's'}, summarising what’s new and laying it out. This takes about a minute — the page will
            update by itself.
          </p>
          {lastRun?.status === 'done' && !working && (
            <p className="note" style={{ marginTop: '1.5rem' }}>
              The last check found nothing recent enough to publish. New sources contribute their latest few posts from the past two weeks — add a more
              active source, or come back tomorrow.
            </p>
          )}
          {!working && <AutoRun reason="first-edition" />}
        </div>
      </section>
    );
  }

  // Safety net for the daily cron: if today's edition is missing when you open the page, build it now.
  const editionAge = Date.now() - new Date(view.edition.created_at).getTime();
  const lastRunAge = lastRun ? Date.now() - new Date(lastRun.started_at).getTime() : Infinity;
  const stale = sourceCount > 0 && editionAge > 20 * HOUR && lastRunAge > 3 * HOUR;

  return (
    <>
      {stale && <AutoRun reason={`stale-${view.edition.id}`} />}
      <Edition view={view} />
    </>
  );
}
