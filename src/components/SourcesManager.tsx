'use client';

import { useRef, useState } from 'react';
import { hostname } from '@/lib/format';
import { PACKS } from '@/lib/packs';
import type { SourceView } from '@/lib/sources';

type Result = { input: string; ok: boolean; duplicate?: boolean; title?: string; kind?: string; via?: string; error?: string };

const KIND_LABEL: Record<string, string> = { page: 'Scanned page', youtube: 'YouTube', reddit: 'Reddit', newsletter: 'Newsletter', inbox: 'Email inbox' };

function ago(iso: string | null) {
  if (!iso) return 'never';
  const m = Math.round((Date.now() - new Date(iso).getTime()) / 60000);
  if (m < 60) return `${Math.max(m, 1)}m ago`;
  const h = Math.round(m / 60);
  return h < 48 ? `${h}h ago` : `${Math.round(h / 24)}d ago`;
}

/** Split what was typed/pasted into links and plain names; OPML files yield their feed URLs. */
export function parseSourcesInput(text: string): { urls: string[]; names: string[] } {
  if (/<opml/i.test(text)) {
    const doc = new DOMParser().parseFromString(text, 'text/xml');
    const urls = [...doc.querySelectorAll('outline')].map((o) => o.getAttribute('xmlUrl') ?? o.getAttribute('xmlurl') ?? '').filter(Boolean);
    return { urls, names: [] };
  }
  const urls: string[] = [];
  const names: string[] = [];
  for (const line of text.split(/\n|,(?![^(]*\))/)) {
    const t = line.trim().replace(/^[-*•\d.)\s]+/, '').replace(/^[<(["']+|[>)\]"'.;]+$/g, '');
    if (!t) continue;
    const tokens = t.split(/\s+/);
    const link = tokens.find((tok) => /^(https?:\/\/|feed:)/i.test(tok) || /^[\w-]+(\.[\w-]+)+(\/\S*)?$/.test(tok));
    if (link) urls.push(link);
    else if (t.length <= 80) names.push(t);
  }
  return { urls, names };
}

function Status({ s }: { s: SourceView }) {
  if (!s.enabled) return <span><span className="dot" />Paused</span>;
  if (s.last_error && s.consecutive_failures >= 3) return <span><span className="dot bad" />Failing: {s.last_error}</span>;
  if (s.last_error) return <span><span className="dot warn" />Last check failed: {s.last_error}</span>;
  if (!s.last_success_at) return <span><span className="dot" />Waiting for first check</span>;
  return (
    <span>
      <span className="dot ok" />
      Checked {ago(s.last_success_at as unknown as string)} · {s.recent_items} in your papers this month
    </span>
  );
}

export function SourcesManager({
  initial,
  compact,
  inboxReady,
  onChange,
}: {
  initial: SourceView[];
  compact?: boolean;
  inboxReady: boolean;
  onChange?: (s: SourceView[]) => void;
}) {
  const [sources, setSourcesState] = useState(initial);
  const setSources = (s: SourceView[]) => {
    setSourcesState(s);
    onChange?.(s);
  };
  const [text, setText] = useState('');
  const [adding, setAdding] = useState<string | null>(null);
  const [results, setResults] = useState<Result[]>([]);
  const [editing, setEditing] = useState<string | null>(null);
  const [draft, setDraft] = useState({ url: '', title: '' });
  const [busy, setBusy] = useState<string | null>(null);
  const [rowError, setRowError] = useState<{ id: string; msg: string } | null>(null);
  const [inbox, setInbox] = useState<{ email: string } | null>(null);
  const [inboxError, setInboxError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  async function add(payload: { urls: string[]; names: string[] }, label: string) {
    if (!payload.urls.length && !payload.names.length) {
      setResults([{ input: text.trim() || '(empty)', ok: false, error: 'Nothing to add — paste links or type names.' }]);
      return;
    }
    setAdding(label);
    setResults([]);
    try {
      const res = await fetch('/api/sources', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(payload) });
      const body = await res.json();
      if (!res.ok) throw new Error(body.error ?? `HTTP ${res.status}`);
      setResults(body.results);
      setSources(body.sources);
      if (label === 'text') setText((body.results as Result[]).filter((r) => !r.ok).map((r) => r.input).join('\n'));
    } catch (err) {
      setResults([{ input: 'Request', ok: false, error: err instanceof Error ? err.message : String(err) }]);
    } finally {
      setAdding(null);
    }
  }

  async function createInbox() {
    setAdding('inbox');
    setInboxError(null);
    try {
      const res = await fetch('/api/sources/inbox', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ title: 'Newsletters' }) });
      const body = await res.json();
      if (!res.ok) throw new Error(body.error ?? `HTTP ${res.status}`);
      setInbox(body.inbox);
      setSources(body.sources);
    } catch (err) {
      setInboxError(err instanceof Error ? err.message : String(err));
    } finally {
      setAdding(null);
    }
  }

  async function patch(id: string, body: Record<string, unknown>) {
    setBusy(id);
    setRowError(null);
    try {
      const res = await fetch(`/api/sources/${id}`, { method: 'PATCH', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) });
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

  const inboxes = sources.filter((s) => s.inbox_email);
  const followed = new Set(sources.map((s) => hostname(s.site_url ?? s.feed_url)));

  return (
    <div className="stack-lg">
      <form
        className="panel stack"
        onSubmit={(e) => {
          e.preventDefault();
          add(parseSourcesInput(text), 'text');
        }}
      >
        <div>
          <h2 className="panel-title">Add sources</h2>
          <p className="panel-sub">
            Paste links or just type names — one per line. Blogs, news sites, Substack, Medium, YouTube channels, subreddits, GitHub repos. Sites
            without a feed are scanned for new articles automatically.
          </p>
        </div>
        <textarea
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder={'Stratechery\nLenny’s Newsletter\nhttps://www.theverge.com\nyoutube.com/@veritasium\nreddit.com/r/programming'}
          spellCheck={false}
          autoCapitalize="off"
          autoCorrect="off"
          aria-label="Sources to add"
        />
        <div className="row">
          <button className="btn btn-primary" type="submit" disabled={!!adding || !text.trim()}>
            {adding === 'text' ? (
              <>
                <span className="pulse" aria-hidden /> Finding feeds…
              </>
            ) : (
              'Add'
            )}
          </button>
          <button className="btn btn-quiet" type="button" onClick={() => fileRef.current?.click()} disabled={!!adding}>
            Import OPML
          </button>
          <input
            ref={fileRef}
            type="file"
            accept=".opml,.xml,text/xml,text/x-opml"
            hidden
            onChange={async (e) => {
              const f = e.target.files?.[0];
              if (f) await add(parseSourcesInput(await f.text()), 'opml');
              e.target.value = '';
            }}
          />
          {sources.length > 0 && !compact && (
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
                      <strong>{r.title}</strong>
                      {r.kind && KIND_LABEL[r.kind] && <span className="badge">{KIND_LABEL[r.kind]}</span>}{' '}
                      <span className="muted">{r.duplicate ? '— already following' : r.via ? `— found at ${hostname(r.via)}` : '— added'}</span>
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

      <section className="panel">
        <h2 className="panel-title">Starter packs</h2>
        <p className="panel-sub">One tap adds a handful of well-loved sources. Remove any you don’t want later.</p>
        <div className="packs">
          {PACKS.map((p) => {
            const have = p.urls.every((u) => followed.has(hostname(u)));
            return (
              <button key={p.id} type="button" className="pack" aria-pressed={have} disabled={!!adding || have} onClick={() => add({ urls: p.urls, names: [] }, p.id)}>
                <strong>
                  {adding === p.id ? 'Adding…' : p.name} {have && '✓'}
                </strong>
                <span>{p.blurb}</span>
              </button>
            );
          })}
        </div>
      </section>

      <section className="panel stack">
        <div>
          <h2 className="panel-title">Email newsletters</h2>
          <p className="panel-sub">
            Get a private email address for newsletters that only arrive by email. Subscribe to them with this address and every issue shows up in
            your paper — summarised like everything else.
          </p>
        </div>
        {inboxes.map((s) => (
          <div key={s.id} className="inbox-address">
            <span style={{ flex: 1 }}>{s.inbox_email}</span>
            <button
              type="button"
              className="btn btn-sm"
              onClick={async () => {
                await navigator.clipboard.writeText(s.inbox_email!);
                setCopied(true);
                setTimeout(() => setCopied(false), 1500);
              }}
            >
              {copied ? 'Copied' : 'Copy'}
            </button>
          </div>
        ))}
        {inbox && <p className="note ok-text">Your address is ready. Subscribe to newsletters with it — new issues appear in your next edition.</p>}
        {inboxError && <p className="note error-text">{inboxError}</p>}
        {!inboxes.length && inboxReady && (
          <div>
            <button type="button" className="btn btn-primary" onClick={createInbox} disabled={!!adding}>
              {adding === 'inbox' ? 'Creating…' : 'Create my newsletter address'}
            </button>
          </div>
        )}
        {!inboxes.length && !inboxReady && (
          <ol className="steps" style={{ margin: '0.4rem 0 0' }}>
            <li>
              Open{' '}
              <a href="https://kill-the-newsletter.com" target="_blank" rel="noreferrer">
                kill-the-newsletter.com
              </a>
              , type a name and press “Create feed” (free, no account).
            </li>
            <li>Subscribe to your newsletters with the email address it shows.</li>
            <li>Paste the feed link it shows into “Add sources” above.</li>
          </ol>
        )}
        <p className="hint">Substack, Beehiiv, Ghost and Buttondown newsletters don’t need this — paste their web address above instead.</p>
      </section>

      {sources.length > 0 && (
        <section>
          <div className="row" style={{ marginBottom: '0.6rem' }}>
            <h2 className="panel-title" style={{ margin: 0 }}>
              Following {sources.length}
            </h2>
          </div>
          <ul className="source-list">
            {sources.map((s) => (
              <li key={s.id} className={`source${s.enabled ? '' : ' paused'}`}>
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={`https://www.google.com/s2/favicons?domain=${hostname(s.site_url ?? s.feed_url)}&sz=64`}
                  alt=""
                  loading="lazy"
                  onError={(e) => {
                    e.currentTarget.style.visibility = 'hidden';
                  }}
                />
                <div>
                  <div className="source-title">
                    {s.title}
                    {KIND_LABEL[s.kind] && <span className="badge">{KIND_LABEL[s.kind]}</span>}
                  </div>
                  <div className="source-sub">{s.inbox_email ?? hostname(s.site_url ?? s.feed_url)}</div>
                  <div className="source-sub">
                    <Status s={s} />
                  </div>
                </div>
                <div className="source-actions">
                  <button
                    className="btn btn-quiet btn-sm"
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
                  <button className="btn btn-quiet btn-sm" type="button" disabled={busy === s.id} onClick={() => patch(s.id, { enabled: !s.enabled })}>
                    {s.enabled ? 'Pause' : 'Resume'}
                  </button>
                  <button className="btn btn-quiet btn-sm btn-danger" type="button" disabled={busy === s.id} onClick={() => remove(s)} aria-label={`Remove ${s.title}`}>
                    ✕
                  </button>
                </div>
                {editing === s.id && (
                  <form
                    className="source-edit stack"
                    onSubmit={async (e) => {
                      e.preventDefault();
                      const urlChanged = !s.inbox_email && draft.url.trim() !== (s.input_url || s.feed_url) && draft.url.trim() !== s.feed_url;
                      const ok = await patch(s.id, urlChanged ? { url: draft.url, title: draft.title } : { title: draft.title });
                      if (ok) setEditing(null);
                    }}
                  >
                    <label className="field">
                      <span>Name</span>
                      <input type="text" value={draft.title} onChange={(e) => setDraft({ ...draft, title: e.target.value })} />
                    </label>
                    {!s.inbox_email && (
                      <label className="field">
                        <span>Link</span>
                        <input type="url" inputMode="url" value={draft.url} onChange={(e) => setDraft({ ...draft, url: e.target.value })} spellCheck={false} />
                      </label>
                    )}
                    <p className="source-sub">{s.kind === 'page' ? 'Scanning page' : 'Feed'}: {s.feed_url}</p>
                    <div className="row">
                      <button className="btn btn-primary btn-sm" type="submit" disabled={busy === s.id}>
                        {busy === s.id ? 'Saving…' : 'Save'}
                      </button>
                      <button className="btn btn-quiet btn-sm" type="button" onClick={() => setEditing(null)}>
                        Cancel
                      </button>
                    </div>
                  </form>
                )}
                {rowError?.id === s.id && (
                  <p className="source-edit note error-text" style={{ margin: 0 }}>
                    {rowError.msg}
                  </p>
                )}
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}
