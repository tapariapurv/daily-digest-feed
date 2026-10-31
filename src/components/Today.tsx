import Link from 'next/link';
import { rows, type Run } from '@/lib/db';
import { runsOf } from '@/lib/pipeline';
import { sourcesOf } from '@/lib/sources';
import { getEditionData } from '@/lib/editions';
import type { Profile } from '@/lib/profile';
import { Edition } from './Edition';
import { AutoRun } from './RunButton';

const HOUR = 3600_000;

export async function Today({ profile }: { profile: Profile }) {
  const userId = profile.user_id;
  const [[{ n: sourceCount }], data, [lastRun]] = await Promise.all([
    sourcesOf(userId).where('enabled', '==', true).count().get().then((c) => [{ n: c.data().count }]),
    getEditionData(userId),
    runsOf(userId).orderBy('started_at', 'desc').limit(1).get().then((s) => rows<Run>(s)),
  ]);

  if (!sourceCount && !data) {
    return (
      <section className="empty masthead reveal">
        <div className="masthead-inner">
          <p className="dateline meta">
            <span>Almost there</span>
          </p>
          <h1 className="headline">Add a few sources to print your first paper.</h1>
          <p className="intro">Paste links, type names like “Stratechery”, or pick a starter pack — it takes a minute.</p>
          <p style={{ marginTop: '1.6rem' }}>
            <Link href="/sources" className="btn btn-primary">
              Add sources →
            </Link>
          </p>
        </div>
      </section>
    );
  }

  if (!data) {
    const working = lastRun?.status === 'running';
    return (
      <section className="empty masthead reveal">
        <div className="masthead-inner">
          <p className="dateline meta">
            <span>Edition No. 1</span>
          </p>
          <h1 className="headline">Your first edition is on the press.</h1>
          <p className="intro">
            Reading {sourceCount} source{sourceCount === 1 ? '' : 's'}, summarising what’s new and laying it out. This takes a minute or two — the
            page updates by itself.
          </p>
          {lastRun?.status === 'done' && !working && (
            <p className="note" style={{ marginTop: '1.5rem' }}>
              The last check found nothing recent enough to publish. New sources contribute their latest few posts from the past two weeks — add a more
              active source, or hit Refresh later.
            </p>
          )}
          {lastRun?.status === 'error' && <p className="note error-text">Last attempt failed: {lastRun.error}</p>}
          {!working && <AutoRun reason="first-edition" />}
        </div>
      </section>
    );
  }

  // Safety net for the scheduler: if the paper is stale when you open it, print one now.
  const editionAge = Date.now() - new Date(data.edition.created_at).getTime();
  const lastRunAge = lastRun ? Date.now() - new Date(lastRun.started_at).getTime() : Infinity;
  const stale = sourceCount > 0 && editionAge > 20 * HOUR && lastRunAge > 3 * HOUR;

  return (
    <>
      {stale && <AutoRun reason={`stale-${data.edition.id}`} />}
      <Edition data={data} design={profile.design} reading={profile.reading} />
    </>
  );
}
