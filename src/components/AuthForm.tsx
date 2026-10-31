'use client';

import Link from 'next/link';
import { useState } from 'react';
import { createUserWithEmailAndPassword, GoogleAuthProvider, sendPasswordResetEmail, signInWithEmailAndPassword, signInWithPopup, type UserCredential } from 'firebase/auth';
import { browserAuth, startSession } from '@/lib/firebase/browser';

type Mode = 'login' | 'signup' | 'forgot';

const COPY: Record<Mode, { title: string; lede: string; cta: string }> = {
  login: { title: 'Good morning.', lede: 'Sign in to read today’s paper.', cta: 'Sign in' },
  signup: { title: 'Start your paper.', lede: 'Free. Takes a minute. Your sources, summarised every morning.', cta: 'Create account' },
  forgot: { title: 'Forgot it?', lede: 'We’ll email you a link to set a new password.', cta: 'Send reset link' },
};

function friendly(message: string): string {
  if (/invalid-credential|wrong-password|user-not-found/i.test(message)) return 'That email and password don’t match.';
  if (/email-already-in-use/i.test(message)) return 'There’s already an account with that email — sign in instead.';
  if (/invalid-email/i.test(message)) return 'That doesn’t look like an email address.';
  if (/weak-password/i.test(message)) return 'Use at least 8 characters for your password.';
  if (/too-many-requests/i.test(message)) return 'Too many attempts — wait a minute and try again.';
  if (/popup-closed|cancelled-popup/i.test(message)) return 'Google sign-in was closed before it finished.';
  if (/network-request-failed/i.test(message)) return 'You seem to be offline — check your connection.';
  return message.replace(/^Firebase: /, '');
}

/** After any sign-in: hand the token to the server, then go where the reader was heading. */
async function enter(cred: UserCredential, fallback: string) {
  await startSession(await cred.user.getIdToken());
  const next = new URLSearchParams(window.location.search).get('next');
  window.location.href = next && next.startsWith('/') && !next.startsWith('//') ? next : fallback;
}

export function AuthForm({ mode }: { mode: Mode }) {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);
  const [show, setShow] = useState(false);
  const copy = COPY[mode];

  async function google() {
    setBusy(true);
    setError(null);
    try {
      await enter(await signInWithPopup(browserAuth(), new GoogleAuthProvider()), '/');
    } catch (err) {
      setError(friendly(err instanceof Error ? err.message : String(err)));
      setBusy(false);
    }
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    setInfo(null);
    const auth = browserAuth();
    try {
      if (mode === 'login') return await enter(await signInWithEmailAndPassword(auth, email, password), '/');
      if (mode === 'signup') {
        if (password.length < 8) throw new Error('Use at least 8 characters for your password.');
        try {
          return await enter(await createUserWithEmailAndPassword(auth, email, password), '/welcome');
        } catch (err) {
          // Same email and password as an existing account: just sign them in.
          if (!/email-already-in-use/.test(String(err))) throw err;
          return await enter(await signInWithEmailAndPassword(auth, email, password), '/');
        }
      }
      await sendPasswordResetEmail(auth, email);
      setInfo('If that email has an account, a reset link is on its way. Set a new password there, then sign in here.');
      setBusy(false);
    } catch (err) {
      setError(friendly(err instanceof Error ? err.message : String(err)));
      setBusy(false);
    }
  }

  return (
    <div>
      <h1 className="headline auth-title">
        {copy.title}
      </h1>
      <p className="lede" style={{ marginBottom: '1.6rem' }}>
        {copy.lede}
      </p>
      <form className="stack" onSubmit={submit}>
        {mode !== 'forgot' && (
          <>
            <button className="btn btn-block btn-google" type="button" onClick={google} disabled={busy}>
              <svg width="18" height="18" viewBox="0 0 48 48" aria-hidden>
                <path fill="#FFC107" d="M43.6 20.5H42V20H24v8h11.3C33.7 32.7 29.2 36 24 36c-6.6 0-12-5.4-12-12s5.4-12 12-12c3.1 0 5.8 1.2 7.9 3.1l5.7-5.7C34 6.1 29.3 4 24 4 12.9 4 4 12.9 4 24s8.9 20 20 20 20-8.9 20-20c0-1.3-.1-2.4-.4-3.5z" />
                <path fill="#FF3D00" d="m6.3 14.7 6.6 4.8C14.7 15.1 19 12 24 12c3.1 0 5.8 1.2 7.9 3.1l5.7-5.7C34 6.1 29.3 4 24 4 16.3 4 9.7 8.3 6.3 14.7z" />
                <path fill="#4CAF50" d="M24 44c5.2 0 9.9-2 13.4-5.2l-6.2-5.2C29.2 35.1 26.7 36 24 36c-5.2 0-9.6-3.3-11.3-7.9l-6.5 5C9.5 39.6 16.2 44 24 44z" />
                <path fill="#1976D2" d="M43.6 20.5H42V20H24v8h11.3c-.8 2.2-2.2 4.2-4.1 5.6l6.2 5.2C37 39.2 44 34 44 24c0-1.3-.1-2.4-.4-3.5z" />
              </svg>
              Continue with Google
            </button>
            <p className="or">
              <span>or with email</span>
            </p>
          </>
        )}
        <label className="field">
            <span>Email</span>
            <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} autoComplete="email" required autoFocus />
          </label>
        {mode !== 'forgot' && (
          <label className="field">
            <span>Password</span>
            <span className="pw">
            <input
              type={show ? 'text' : 'password'}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              autoComplete={mode === 'login' ? 'current-password' : 'new-password'}
              minLength={mode === 'login' ? undefined : 8}
              required
            />
            <button type="button" className="pw-toggle" onClick={() => setShow((v) => !v)} aria-label={show ? 'Hide password' : 'Show password'}>
              {show ? 'Hide' : 'Show'}
            </button>
            </span>
            {mode !== 'login' && <small className="hint">At least 8 characters.</small>}
          </label>
        )}
        <button className="btn btn-primary btn-block" type="submit" disabled={busy}>
          {busy ? 'One moment…' : copy.cta}
        </button>
        {error && <p className="note error-text">{error}</p>}
        {info && <p className="note ok-text">{info}</p>}
      </form>
      <p className="note" style={{ marginTop: '1.6rem' }}>
        {mode === 'login' && (
          <>
            New here? <Link href="/signup">Create an account</Link> · <Link href="/forgot">Forgot password?</Link>
          </>
        )}
        {mode === 'signup' && (
          <>
            Already have an account? <Link href="/login">Sign in</Link>
          </>
        )}
        {mode === 'forgot' && <Link href="/login">Back to sign in</Link>}
      </p>
    </div>
  );
}
