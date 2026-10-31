'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { createSupabaseBrowser } from '@/lib/supabase/browser';

type Mode = 'login' | 'signup' | 'forgot' | 'reset';

const COPY: Record<Mode, { title: string; lede: string; cta: string }> = {
  login: { title: 'Good morning.', lede: 'Sign in to read today’s paper.', cta: 'Sign in' },
  signup: { title: 'Start your paper.', lede: 'Free. Takes a minute. Your sources, summarised every morning.', cta: 'Create account' },
  forgot: { title: 'Forgot it?', lede: 'We’ll email you a link to set a new password.', cta: 'Send reset link' },
  reset: { title: 'New password.', lede: 'Choose a new password for your account.', cta: 'Save password' },
};

function friendly(message: string): string {
  if (/invalid login credentials/i.test(message)) return 'That email and password don’t match.';
  if (/email not confirmed/i.test(message)) return 'Confirm your email first — check your inbox for the link.';
  if (/already registered|already been registered/i.test(message)) return 'There’s already an account with that email — sign in instead.';
  if (/not authorized|sending.*email/i.test(message)) return 'We couldn’t send email to that address right now. Please contact the site owner.';
  if (/email rate limit/i.test(message)) return 'We’ve sent too many emails this hour — please try again later.';
  if (/rate limit/i.test(message)) return 'Too many attempts — wait a minute and try again.';
  return message;
}

export function AuthForm({ mode }: { mode: Mode }) {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);
  const [show, setShow] = useState(false);
  const [sent, setSent] = useState(false);
  const copy = COPY[mode];

  useEffect(() => {
    const q = new URLSearchParams(window.location.search);
    if (q.get('error') === 'link') setInfo('That link was opened in a different browser or has expired. If you just confirmed your email, sign in below.');
  }, []);

  async function resend() {
    setError(null);
    const { error } = await createSupabaseBrowser().auth.resend({ type: 'signup', email, options: { emailRedirectTo: `${window.location.origin}/auth/confirm?next=/welcome` } });
    if (error) setError(friendly(error.message));
    else setInfo('Sent again. It can take a minute — check spam too.');
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    setInfo(null);
    const supabase = createSupabaseBrowser();
    const origin = window.location.origin;
    try {
      if (mode === 'login') {
        const { error } = await supabase.auth.signInWithPassword({ email, password });
        if (error) throw error;
        const next = new URLSearchParams(window.location.search).get('next');
        window.location.href = next && next.startsWith('/') && !next.startsWith('//') ? next : '/';
        return;
      }
      if (mode === 'signup') {
        if (password.length < 8) throw new Error('Use at least 8 characters for your password.');
        const { data, error } = await supabase.auth.signUp({
          email,
          password,
          options: { emailRedirectTo: `${origin}/auth/confirm?next=/welcome` },
        });
        if (error) throw error;
        if (data.session) {
          window.location.href = '/welcome';
          return;
        }
        // Supabase answers a sign-up for an existing email with a fake user (no identities) and sends nothing.
        if (data.user && !data.user.identities?.length) {
          const { error: signInError } = await supabase.auth.signInWithPassword({ email, password });
          if (!signInError) {
            window.location.href = '/';
            return;
          }
          throw new Error('There’s already an account with that email. Sign in, or reset your password if you’ve forgotten it.');
        }
        setSent(true);
      }
      if (mode === 'forgot') {
        const { error } = await supabase.auth.resetPasswordForEmail(email, { redirectTo: `${origin}/auth/confirm?next=/auth/reset` });
        if (error) throw error;
        setInfo('If that email has an account, a reset link is on its way.');
      }
      if (mode === 'reset') {
        if (password.length < 8) throw new Error('Use at least 8 characters for your password.');
        const { error } = await supabase.auth.updateUser({ password });
        if (error) throw error;
        window.location.href = '/';
        return;
      }
    } catch (err) {
      setError(friendly(err instanceof Error ? err.message : String(err)));
    }
    setBusy(false);
  }

  if (sent)
    return (
      <div className="auth-sent reveal">
        <div className="auth-stamp" aria-hidden>✉</div>
        <h1 className="headline auth-title">Check your inbox.</h1>
        <p className="lede">
          We sent a link to <strong>{email}</strong>. Open it in this browser and your paper starts setting up.
        </p>
        <div className="row" style={{ gap: '0.6rem', marginTop: '1.4rem' }}>
          <a className="btn btn-primary" href="https://mail.google.com/mail/u/0/#search/from%3Asupabase+OR+%22Morning+Digest%22" target="_blank" rel="noreferrer">
            Open Gmail
          </a>
          <button className="btn btn-quiet" type="button" onClick={resend}>
            Resend link
          </button>
        </div>
        {error && <p className="note error-text">{error}</p>}
        {info && <p className="note ok-text">{info}</p>}
        <p className="note" style={{ marginTop: '1.6rem' }}>
          Wrong address? <button type="button" className="linkish" onClick={() => setSent(false)}>Use another email</button>
        </p>
      </div>
    );

  return (
    <div>
      <h1 className="headline auth-title">
        {copy.title}
      </h1>
      <p className="lede" style={{ marginBottom: '1.6rem' }}>
        {copy.lede}
      </p>
      <form className="stack" onSubmit={submit}>
        {mode !== 'reset' && (
          <label className="field">
            <span>Email</span>
            <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} autoComplete="email" required autoFocus />
          </label>
        )}
        {mode !== 'forgot' && (
          <label className="field">
            <span>{mode === 'reset' ? 'New password' : 'Password'}</span>
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
        {(mode === 'forgot' || mode === 'reset') && <Link href="/login">Back to sign in</Link>}
      </p>
    </div>
  );
}
