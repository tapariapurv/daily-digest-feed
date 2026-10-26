import { LocalDate } from '@/components/LocalDate';
import { SettingsForm } from '@/components/SettingsForm';
import { sql, type Run } from '@/lib/db';
import { timeAgo } from '@/lib/editions';
import { geminiModels } from '@/lib/gemini';
import { getProfile } from '@/lib/settings';

export const dynamic = 'force-dynamic';

export default async function SettingsPage() {
  const [profile, runs] = await Promise.all([getProfile(), sql<Run[]>`select * from runs order by started_at desc limit 8`]);
  return (
    <div className="reveal">
      <div className="masthead">
        <div className="masthead-inner">
          <h1 className="page-title">Settings</h1>
          <p className="lede">Tune the paper to you.</p>
        </div>
      </div>
      <SettingsForm initial={profile} />

      <section className="section">
        <div className="section-head">
          <span className="section-num">i</span>
          <h2 className="section-title">How it runs</h2>
        </div>
        <div className="note stack" style={{ marginTop: '1rem' }}>
          <p>
            A new edition is built automatically every day at about <strong>05:30–06:30 IST</strong> (00:00 UTC). If you open the page and today’s edition
            is missing, it builds one on the spot. <strong>Refresh</strong> fetches anything new right now.
          </p>
          <p>
            Summaries use Google Gemini’s free tier, batching ~20 articles per request so a typical day needs only a handful of calls. Model order:{' '}
            <span className="mono">{geminiModels().join(' → ')}</span>.
          </p>
        </div>
        {runs.length > 0 && (
          <ul className="results" style={{ marginTop: '1.25rem' }}>
            {runs.map((r) => (
              <li key={r.id}>
                <span className={r.status === 'error' ? 'bad' : 'ok'}>{r.status === 'error' ? '✕' : r.status === 'running' ? '…' : '✓'}</span>
                <span>
                  <span className="mono muted">
                    <LocalDate iso={new Date(r.started_at).toISOString()} format="short" /> · {timeAgo(r.started_at)} · {r.trigger}
                  </span>
                  <br />
                  {r.stage}
                  {r.status === 'done' && r.stats && (
                    <span className="muted">
                      {' '}
                      — {String(r.stats.newItems ?? 0)} new, {String(r.stats.summarised ?? 0)} summarised
                      {Number(r.stats.failedSources) ? `, ${r.stats.failedSources} source(s) failed` : ''}
                      {Number(r.stats.queued) ? `, ${r.stats.queued} queued for next run` : ''}
                    </span>
                  )}
                  {r.error && <span style={{ color: 'var(--accent)' }}> — {r.error}</span>}
                </span>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
