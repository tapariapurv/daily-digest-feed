'use client';

import { useRef, useState } from 'react';
import type { SourceView } from '@/lib/sources';

type Result = { input: string; ok: boolean; duplicate?: boolean; title?: string; error?: string };

const hostOf = (url: string | null) => {
  try {
    return url ? new URL(url).hostname.replace(/^www\./, '') : '';
  } catch {
    return '';
  }
};

function ago(iso: string | null) {
  if (!iso) return 'never';
  const m = Math.round((Date.now() - new Date(iso).getTime()) / 60000);
  if (m < 60) return `${Math.max(m, 1)}m ago`;
  const h = Math.round(m / 60);
  return h < 48 ? `${h}h ago` : `${Math.round(h / 24)}d ago`;
}

/** Pull URLs out of pasted text, OPML or a plain list. */
function extractUrls(text: string): string[] {
  if (/<opml/i.test(text)) {
    const doc = new DOMParser().parseFromString(text, 'text/xml');
    return [...doc.querySelectorAll('outline[xmlUrl], outline[xmlurl]')]
      .map((o) => o.getAttribute('xmlUrl') ?? o.getAttribute('xmlurl') ?? '')
      .filter(Boolean);
  }
  return text
    .split(/[\s,]+/)
    .map((t) => t.trim().replace(/^[<(\["']+|[>)\]"'.,;]+$/g, ''))
    .filter((t) => /^(https?:\/\/|feed:)?[\w-]+(\.[\w-]+)+/i.test(t));
}

function Status({ s }: { s: SourceView }) {
  if (!s.enabled) return <span><span className="dot" />Paused</span>;
  if (s.last_error && s.consecutive_failures >= 3) return <span><span className="dot bad" />Failing: {s.last_error}</span>;
  if (s.last_error) return <span><span className="dot warn" />Last check failed: {s.last_error}</span>;
  if (!s.last_success_at) return <span><span className="dot" />Waiting for first check</span>;
  return (
    <span>
      <span className="dot ok" />
      Checked {ago(s.last_success_at as unknown as string)} · {s.recent_items} in 30 days
    </span>
  );
}

export function SourcesManager({ initial }: { initial: SourceView[] }) {
  const [sources, setSources] = useState(initial);
  const [text, setText] = useState('');
  const [adding, setAdding] = useState(false);
  const [results, setResults] = useState<Result[]>([]);
  const [editing, setEditing] = useState<string | null>(null);
  const [draft, setDraft] = useState({ url: '', title: '' });
  const [busy, setBusy] = useState<string | null>(null);
  const [rowError, setRowError] = useState<{ id: string; msg: string } | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  async function add(urls: string[]) {
    if (!urls.length) {
      setResults([{ input: text.trim() || '(empty)', ok: false, error: 'No links found in what you pasted.' }]);
      return;
    }
    setAdding(true);
    setResults([]);
    try {
      const res = await fetch('/api/sources', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ urls }),
      });
      const body = await res.json();
      if (!res.ok) throw new Error(body.error ?? `HTTP ${res.status}`);
      setResults(body.results);
      setSources(body.sources);
      // Keep only the ones that failed in the box, so they can be fixed and retried.
      setText((body.results as Result[]).filter((r) => !r.ok).map((r) => r.input).join('\n'));
    } catch (err) {
      setResults([{ input: 'Request', ok: false, error: err instanceof Error ? err.message : String(err) }]);
    } finally {
      setAdding(false);
    }
  }

  async function patch(id: string, body: Record<string, unknown>) {
    setBusy(id);
    setRowError(null);
    try {
      const res = await fetch(`/api/sources/${id}`, {
        method: 'PATCH',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(body),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? `HTTP ${res.status}`);
      setSources(data.sources);
      return true;
    } catch (err) {
      setRowError({ id, msg: err instanceof Error ? err.message : String(err) });
      return false;
    } finally {
      setBusy(null);
    }
  }

  async function remove(s: SourceView) {
    if (!confirm(`Stop following “${s.title}”? Past editions keep its stories.`)) return;
    setBusy(s.id);
    const res = await fetch(`/api/sources/${s.id}`, { method: 'DELETE' });
    if (res.ok) setSources((await res.json()).sources);
    setBusy(null);
  }

  async function importFile(file: File) {
    const content = await file.text();
    await add(extractUrls(content));
  }

  return (
    <div className="reveal">
      <div className="masthead">
        <div className="masthead-inner">
          <h1 className="page-title">Sources</h1>
          <p className="lede">
            {sources.length ? `Following ${sources.length} source${sources.length === 1 ? '' : 's'}.` : 'Nothing followed yet.'} Paste links any time —
            blog homepages, RSS or Atom feeds, Substack, Medium, Ghost, YouTube channels, subreddits, GitHub repos.
          </p>
        </div>
      </div>

      <form
        className="panel stack"
        onSubmit={(e) => {
          e.preventDefault();
          add(extractUrls(text));
        }}
      >
        <label className="field">
          <span>Add sources — one or many</span>
          <textarea
            value={text}
            onChange={(e) => setText(e.target.value)}
            placeholder={'https://stratechery.com\nhttps://www.lennysnewsletter.com\nyoutube.com/@veritasium\nreddit.com/r/programming'}
            spellCheck={false}
            autoCapitalize="off"
            autoCorrect="off"
          />
        </label>
        <div className="row">
          <button className="btn btn-primary" type="submit" disabled={adding || !text.trim()}>
            {adding ? (
              <>
                <span className="pulse" aria-hidden /> Finding feeds…
              </>
            ) : (
              'Add'
            )}
          </button>
          <button className="btn btn-quiet" type="button" onClick={() => fileRef.current?.click()} disabled={adding}>
            Import OPML
          </button>
          <input
            ref={fileRef}
            type="file"
            accept=".opml,.xml,text/xml,text/x-opml"
            hidden
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) importFile(f);
              e.target.value = '';
            }}
          />
          {sources.length > 0 && (
            <a className="btn btn-quiet" href="/api/sources/opml">
              Export OPML
            </a>
          )}
        </div>
        {results.length > 0 && (
          <ul className="results" aria-live="polite">
            {results.map((r) => (
              <li key={r.input}>
                <span className={r.ok ? 'ok' : 'bad'}>{r.ok ? '✓' : '✕'}</span>
                <span>
                  {r.ok ? (
                    <>
                      <strong>{r.title}</strong> {r.duplicate ? <span className="muted">— already following</span> : <span className="muted">— added</span>}
                    </>
                  ) : (
                    <>
                      <span className="muted">{r.input}</span> — {r.error}
                    </>
                  )}
                </span>
              </li>
            ))}
          </ul>
        )}
      </form>

      <details className="note" style={{ margin: '1.25rem 0 2.5rem' }}>
        <summary style={{ cursor: 'pointer' }}>
          <strong>Email-only newsletter?</strong> Here’s the free workaround.
        </summary>
        <p>
          Go to <a href="https://kill-the-newsletter.com" target="_blank" rel="noreferrer">kill-the-newsletter.com</a>, create an inbox (free, no
          account), and subscribe to the newsletter with the email address it gives you. Then paste the <em>feed</em> URL it shows here. Most Substack,
          Beehiiv, Ghost and Buttondown newsletters don’t need this — just paste their web address.
        </p>
      </details>

      {sources.length > 0 && (
        <ul className="source-list">
          {sources.map((s) => (
            <li key={s.id} className={`source${s.enabled ? '' : ' paused'}`}>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={`https://www.google.com/s2/favicons?domain=${hostOf(s.site_url ?? s.feed_url)}&sz=64`} alt="" loading="lazy" />
              <div>
                <div className="source-title">{s.title}</div>
                <div className="source-sub">{hostOf(s.site_url ?? s.feed_url)}{s.kind !== 'feed' ? ` · ${s.kind}` : ''}</div>
                <div className="source-sub">
                  <Status s={s} />
                </div>
              </div>
              <div className="source-actions">
                <button
                  className="btn btn-quiet"
                  type="button"
                  disabled={busy === s.id}
                  onClick={() => {
                    setEditing(editing === s.id ? null : s.id);
                    setDraft({ url: s.input_url || s.feed_url, title: s.title });
                    setRowError(null);
                  }}
                >
                  Edit
                </button>
                <button className="btn btn-quiet" type="button" disabled={busy === s.id} onClick={() => patch(s.id, { enabled: !s.enabled })}>
                  {s.enabled ? 'Pause' : 'Resume'}
                </button>
                <button className="btn btn-quiet btn-danger" type="button" disabled={busy === s.id} onClick={() => remove(s)} aria-label={`Remove ${s.title}`}>
                  ✕
                </button>
              </div>
              {editing === s.id && (
                <form
                  className="source-edit stack"
                  onSubmit={async (e) => {
                    e.preventDefault();
                    const urlChanged = draft.url.trim() !== (s.input_url || s.feed_url) && draft.url.trim() !== s.feed_url;
                    const ok = await patch(s.id, urlChanged ? { url: draft.url, title: draft.title } : { title: draft.title });
                    if (ok) setEditing(null);
                  }}
                >
                  <label className="field">
                    <span>Name</span>
                    <input type="text" value={draft.title} onChange={(e) => setDraft({ ...draft, title: e.target.value })} />
                  </label>
                  <label className="field">
                    <span>Link</span>
                    <input type="url" inputMode="url" value={draft.url} onChange={(e) => setDraft({ ...draft, url: e.target.value })} spellCheck={false} />
                  </label>
                  <p className="source-sub">Feed: {s.feed_url}</p>
                  <div className="row">
                    <button className="btn btn-primary" type="submit" disabled={busy === s.id}>
                      {busy === s.id ? 'Saving…' : 'Save'}
                    </button>
                    <button className="btn btn-quiet" type="button" onClick={() => setEditing(null)}>
                      Cancel
                    </button>
                  </div>
                </form>
              )}
              {rowError?.id === s.id && (
                <p className="source-edit note" style={{ color: 'var(--accent)', margin: 0 }}>
                  {rowError.msg}
                </p>
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
