'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';
import type { Profile } from '@/lib/settings';

export function SettingsForm({ initial }: { initial: Profile }) {
  const router = useRouter();
  const [name, setName] = useState(initial.name);
  const [interests, setInterests] = useState(initial.interests);
  const [passcode, setPasscode] = useState('');
  const [status, setStatus] = useState<{ ok: boolean; msg: string } | null>(null);
  const [saving, setSaving] = useState(false);

  async function save(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setStatus(null);
    try {
      const res = await fetch('/api/settings', {
        method: 'PUT',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ name, interests, passcode: passcode || undefined }),
      });
      const body = await res.json();
      if (!res.ok) throw new Error(body.error ?? `HTTP ${res.status}`);
      setPasscode('');
      setStatus({ ok: true, msg: passcode ? 'Saved. Other devices will need the new passcode.' : 'Saved.' });
      router.refresh();
    } catch (err) {
      setStatus({ ok: false, msg: err instanceof Error ? err.message : String(err) });
    } finally {
      setSaving(false);
    }
  }

  async function signOut() {
    await fetch('/api/auth/logout', { method: 'POST' });
    router.push('/login');
    router.refresh();
  }

  return (
    <form className="panel stack" onSubmit={save}>
      <label className="field">
        <span>Name of your paper</span>
        <input type="text" value={name} onChange={(e) => setName(e.target.value)} maxLength={60} />
      </label>
      <label className="field">
        <span>What you care about</span>
        <textarea
          value={interests}
          onChange={(e) => setInterests(e.target.value)}
          maxLength={1500}
          placeholder="e.g. Founder building a B2B SaaS. Care most about AI products, go-to-market, pricing and fundraising. Skip celebrity news, sports and crypto price chatter."
        />
      </label>
      <p className="note" style={{ marginTop: '-0.4rem' }}>
        Used to rank stories — what matters to you leads the edition; promotional or off-topic posts sink to “Briefly noted”.
      </p>
      <label className="field">
        <span>New passcode (optional)</span>
        <input type="password" value={passcode} onChange={(e) => setPasscode(e.target.value)} autoComplete="new-password" placeholder="At least 8 characters" />
      </label>
      <div className="row">
        <button className="btn btn-primary" type="submit" disabled={saving}>
          {saving ? 'Saving…' : 'Save'}
        </button>
        {status && <span className="note" style={{ color: status.ok ? 'var(--ok)' : 'var(--accent)' }}>{status.msg}</span>}
        <span className="spacer" />
        <button className="btn btn-quiet" type="button" onClick={signOut}>
          Sign out
        </button>
      </div>
    </form>
  );
}
