'use client';

import { useState } from 'react';
import { IconBookmark } from './Icons';

/** Remote images can break (hotlink protection, dead links); hide them quietly when they do. */
export function Thumb({ src, href, eager }: { src: string; href: string; eager?: boolean }) {
  const [failed, setFailed] = useState(false);
  if (failed) return null;
  return (
    <a className="story-media" href={href} target="_blank" rel="noopener noreferrer" tabIndex={-1} aria-hidden>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={src} alt="" loading={eager ? 'eager' : 'lazy'} decoding="async" referrerPolicy="no-referrer" onError={() => setFailed(true)} />
    </a>
  );
}

export function SaveButton({ articleId, initial, disabled }: { articleId: number; initial: boolean; disabled?: boolean }) {
  const [saved, setSaved] = useState(initial);
  const [busy, setBusy] = useState(false);
  async function toggle() {
    if (disabled) return;
    const next = !saved;
    setSaved(next);
    setBusy(true);
    try {
      const res = await fetch('/api/saved', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ articleId, saved: next }),
      });
      if (!res.ok) setSaved(!next);
    } catch {
      setSaved(!next);
    } finally {
      setBusy(false);
    }
  }
  return (
    <button type="button" className="save-btn" aria-pressed={saved} aria-label={saved ? 'Remove from saved' : 'Save for later'} title={saved ? 'Saved' : 'Save for later'} onClick={toggle} disabled={busy}>
      <IconBookmark filled={saved} />
    </button>
  );
}
