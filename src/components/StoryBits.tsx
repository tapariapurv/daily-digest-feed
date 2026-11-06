'use client';

import { useEffect, useRef, useState } from 'react';
import { IconBookmark } from './Icons';

/** Narrower than this looks blurry at full column width. */
const MIN_IMAGE_WIDTH = 400;

/** Remote images can break (hotlink protection, dead links) or be tiny; hide them quietly when they are. */
export function Thumb({ src, href, eager }: { src: string; href: string; eager?: boolean }) {
  const [failed, setFailed] = useState(false);
  const ref = useRef<HTMLImageElement>(null);
  const check = () => {
    const img = ref.current;
    if (img?.complete && img.naturalWidth < MIN_IMAGE_WIDTH) setFailed(true);
  };
  // Images can finish (or fail) before hydration, when onLoad/onError aren't listening yet.
  useEffect(check, []);
  if (failed) return null;
  return (
    <a className="story-media" href={href} target="_blank" rel="noopener noreferrer" tabIndex={-1} aria-hidden>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img ref={ref} src={src} alt="" loading={eager ? 'eager' : 'lazy'} decoding="async" referrerPolicy="no-referrer" onLoad={check} onError={() => setFailed(true)} />
    </a>
  );
}

/** An emailed newsletter at its full height, so the page scrolls instead of a box inside it. Scripts stay blocked by the sandbox. */
export function MailFrame({ title, doc }: { title: string; doc: string }) {
  const [height, setHeight] = useState(900);
  return (
    <iframe
      className="mail-frame"
      title={title}
      srcDoc={doc}
      sandbox="allow-same-origin allow-popups allow-popups-to-escape-sandbox"
      style={{ height }}
      onLoad={(e) => setHeight(e.currentTarget.contentDocument?.documentElement.scrollHeight ?? 900)}
    />
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
