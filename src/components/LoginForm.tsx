'use client';

import { useState } from 'react';

export function LoginForm() {
  const [passcode, setPasscode] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const res = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ passcode }),
      });
      if (!res.ok) throw new Error((await res.json()).error ?? 'Sign-in failed');
      const next = new URLSearchParams(window.location.search).get('next');
      window.location.href = next && next.startsWith('/') && !next.startsWith('//') ? next : '/';
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
      setBusy(false);
    }
  }

  return (
    <form className="stack" onSubmit={submit}>
      <label className="field">
        <span>Passcode</span>
        <input type="password" value={passcode} onChange={(e) => setPasscode(e.target.value)} autoFocus autoComplete="current-password" />
      </label>
      <div className="row">
        <button className="btn btn-primary" type="submit" disabled={busy || !passcode}>
          {busy ? 'Opening…' : 'Open today’s paper'}
        </button>
        {error && <span className="note" style={{ color: 'var(--accent)' }}>{error}</span>}
      </div>
    </form>
  );
}
