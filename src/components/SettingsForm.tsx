'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useMemo, useState } from 'react';
import type { Run } from '@/lib/db';
import { timeAgo } from '@/lib/format';
import type { Profile, Schedule } from '@/lib/profile';
import { createSupabaseBrowser } from '@/lib/supabase/browser';

const DAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

function zones(): string[] {
  try {
    return (Intl as unknown as { supportedValuesOf(k: string): string[] }).supportedValuesOf('timeZone');
  } catch {
    return ['UTC'];
  }
}

export function ScheduleEditor({ value, onChange }: { value: Schedule; onChange: (s: Schedule) => void }) {
  const allZones = useMemo(zones, []);
  const set = (patch: Partial<Schedule>) => onChange({ ...value, ...patch });
  return (
    <div className="stack">
      <label className="switch">
        <span>
          <strong style={{ display: 'block' }}>Deliver automatically</strong>
          <span className="hint" style={{ margin: 0 }}>
            Your paper is printed a few minutes before each time below.
          </span>
        </span>
        <input type="checkbox" checked={value.enabled} onChange={(e) => set({ enabled: e.target.checked })} />
      </label>
      <div style={{ opacity: value.enabled ? 1 : 0.5 }}>
        <span className="label">Delivery times</span>
        <div className="time-row">
          {value.times.map((t, i) => (
            <span key={i} className="row" style={{ gap: '0.2rem' }}>
              <input
                type="time"
                value={t}
                step={900}
                onChange={(e) => set({ times: value.times.map((x, j) => (j === i ? e.target.value : x)) })}
                aria-label={`Delivery time ${i + 1}`}
              />
              {value.times.length > 1 && (
                <button type="button" className="btn btn-quiet btn-sm" onClick={() => set({ times: value.times.filter((_, j) => j !== i) })} aria-label="Remove time">
                  ✕
                </button>
              )}
            </span>
          ))}
          {value.times.length < 3 && (
            <button type="button" className="btn btn-sm" onClick={() => set({ times: [...value.times, value.times.includes('18:00') ? '12:00' : '18:00'] })}>
              + Add an edition
            </button>
          )}
        </div>
        <span className="label" style={{ marginTop: '1rem' }}>
          Days
        </span>
        <div className="segmented" role="group" aria-label="Days">
          {DAYS.map((d, i) => (
            <button
              key={d}
              type="button"
              aria-pressed={value.days.includes(i)}
              onClick={() => set({ days: value.days.includes(i) ? value.days.filter((x) => x !== i) : [...value.days, i].sort() })}
            >
              {d}
            </button>
          ))}
        </div>
        <div className="row" style={{ marginTop: '0.6rem' }}>
          <button type="button" className="btn btn-quiet btn-sm" onClick={() => set({ days: [1, 2, 3, 4, 5] })}>
            Weekdays
          </button>
          <button type="button" className="btn btn-quiet btn-sm" onClick={() => set({ days: [0, 1, 2, 3, 4, 5, 6] })}>
            Every day
          </button>
          <button type="button" className="btn btn-quiet btn-sm" onClick={() => set({ days: [0] })}>
            Sundays only
          </button>
        </div>
        <label className="field" style={{ marginTop: '1rem' }}>
          <span>Time zone</span>
          <select value={value.timezone} onChange={(e) => set({ timezone: e.target.value })}>
            {(allZones.includes(value.timezone) ? allZones : [value.timezone, ...allZones]).map((z) => (
              <option key={z} value={z}>
                {z.replace(/_/g, ' ')}
              </option>
            ))}
          </select>
        </label>
      </div>
    </div>
  );
}

export function SettingsForm({ initial, mailReady, runs }: { initial: Profile; mailReady: boolean; runs: Run[] }) {
  const router = useRouter();
  const [schedule, setSchedule] = useState(initial.schedule);
  const [emailDelivery, setEmailDelivery] = useState(initial.email_delivery);
  const [interests, setInterests] = useState(initial.interests);
  const [geminiKey, setGeminiKey] = useState('');
  const [status, setStatus] = useState<{ ok: boolean; msg: string } | null>(null);
  const [saving, setSaving] = useState(false);
  const [testState, setTestState] = useState<string | null>(null);
  const [nextRun, setNextRun] = useState(initial.next_run_at);

  async function save(extra: Record<string, unknown> = {}) {
    setSaving(true);
    setStatus(null);
    try {
      const res = await fetch('/api/profile', {
        method: 'PUT',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ schedule, email_delivery: emailDelivery, interests, ...extra }),
      });
      const body = await res.json();
      if (!res.ok) throw new Error(body.error ?? `HTTP ${res.status}`);
      setNextRun(body.profile.next_run_at);
      setStatus({ ok: true, msg: 'Saved.' });
      setGeminiKey('');
      router.refresh();
    } catch (err) {
      setStatus({ ok: false, msg: err instanceof Error ? err.message : String(err) });
    } finally {
      setSaving(false);
    }
  }

  async function sendTest() {
    setTestState('Sending…');
    const res = await fetch('/api/email/test', { method: 'POST' });
    const body = await res.json().catch(() => ({}));
    setTestState(res.ok ? `Sent to ${body.to}. Check your inbox (and spam, the first time).` : body.error ?? 'Couldn’t send.');
  }

  async function signOut() {
    await createSupabaseBrowser().auth.signOut();
    window.location.href = '/';
  }

  async function deleteData() {
    if (!confirm('Delete your sources, editions and reading history permanently? This can’t be undone.')) return;
    const res = await fetch('/api/account', { method: 'DELETE' });
    if (res.ok) window.location.href = '/';
  }

  return (
    <div className="stack-lg">
      <section className="panel">
        <h2 className="panel-title">Schedule</h2>
        <p className="panel-sub">
          {nextRun && schedule.enabled
            ? `Next edition: ${new Date(nextRun).toLocaleString(undefined, { weekday: 'long', hour: 'numeric', minute: '2-digit' })}.`
            : 'Automatic delivery is off — use Refresh whenever you want a new edition.'}
        </p>
        <ScheduleEditor value={schedule} onChange={setSchedule} />
      </section>

      <section className="panel stack">
        <div>
          <h2 className="panel-title">Email delivery</h2>
          <p className="panel-sub">Get each edition in your inbox as a newsletter{initial.email ? `, at ${initial.email}` : ''}.</p>
        </div>
        <label className="switch">
          <span>Email me every edition</span>
          <input type="checkbox" checked={emailDelivery} onChange={(e) => setEmailDelivery(e.target.checked)} disabled={!mailReady} />
        </label>
        {mailReady ? (
          <div className="row">
            <button type="button" className="btn btn-sm" onClick={sendTest}>
              Send me the latest edition now
            </button>
            {testState && <span className="note">{testState}</span>}
          </div>
        ) : (
          <p className="hint">Email sending hasn’t been switched on for this site yet.</p>
        )}
      </section>

      <section className="panel stack">
        <div>
          <h2 className="panel-title">What you care about</h2>
          <p className="panel-sub">Steers what leads your paper and what gets cut when there’s too much. Write it like you’d brief an editor.</p>
        </div>
        <textarea
          value={interests}
          onChange={(e) => setInterests(e.target.value)}
          maxLength={1500}
          placeholder="e.g. Founder building a B2B SaaS. Care most about AI products, go-to-market, pricing and fundraising. Skip celebrity news, sports and crypto price chatter."
        />
        <p className="hint">
          Looks, length and depth live in <Link href="/design">Design</Link>.
        </p>
      </section>

      <section className="panel stack">
        <div>
          <h2 className="panel-title">Your own Gemini key (optional)</h2>
          <p className="panel-sub">
            Summaries run on a shared free Google Gemini key. Add your own free key from{' '}
            <a href="https://aistudio.google.com/apikey" target="_blank" rel="noreferrer">
              Google AI Studio
            </a>{' '}
            to never wait on shared limits. It’s stored encrypted.
          </p>
        </div>
        <input type="password" value={geminiKey} onChange={(e) => setGeminiKey(e.target.value)} placeholder={initial.has_gemini_key ? '•••••••• (saved — paste a new one to replace)' : 'Paste your API key'} autoComplete="off" />
        {initial.has_gemini_key && (
          <div>
            <button type="button" className="btn btn-quiet btn-sm" onClick={() => save({ gemini_key: '' })}>
              Remove my key
            </button>
          </div>
        )}
      </section>

      <div className="save-bar">
        <button type="button" className="btn btn-primary" onClick={() => save(geminiKey ? { gemini_key: geminiKey } : {})} disabled={saving}>
          {saving ? 'Saving…' : 'Save settings'}
        </button>
        {status && <span className={`note ${status.ok ? 'ok-text' : 'error-text'}`}>{status.msg}</span>}
      </div>

      <section className="panel stack">
        <h2 className="panel-title">Recent runs</h2>
        {runs.length ? (
          <ul className="results" style={{ marginTop: 0 }}>
            {runs.map((r) => (
              <li key={r.id}>
                <span className={r.status === 'error' ? 'bad' : 'ok'}>{r.status === 'error' ? '✕' : r.status === 'running' ? '…' : '✓'}</span>
                <span>
                  <span className="meta">
                    {timeAgo(r.started_at)} · {r.trigger}
                  </span>
                  <br />
                  {r.stage}
                  {r.status === 'done' && r.stats && (
                    <span className="muted">
                      {' '}
                      — {String(r.stats.newItems ?? 0)} new, {String(r.stats.summarised ?? 0)} summarised
                      {Number(r.stats.cached) ? `, ${r.stats.cached} already summarised` : ''}
                      {Number(r.stats.failedSources) ? `, ${r.stats.failedSources} source(s) failed` : ''}
                    </span>
                  )}
                  {r.error && <span className="error-text"> — {r.error}</span>}
                </span>
              </li>
            ))}
          </ul>
        ) : (
          <p className="muted">No runs yet.</p>
        )}
      </section>

      <section className="panel stack">
        <h2 className="panel-title">Account</h2>
        <p className="panel-sub">Signed in as {initial.email}.</p>
        <div className="row">
          <button type="button" className="btn" onClick={signOut}>
            Sign out
          </button>
          <span className="spacer" />
          <button type="button" className="btn btn-quiet btn-danger" onClick={deleteData}>
            Delete my data
          </button>
        </div>
      </section>
    </div>
  );
}
