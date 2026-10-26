'use client';

import Link from 'next/link';
import { useState } from 'react';
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
  if (/rate limit/i.test(message)) return 'Too many attempts — wait a minute and try again.';
  return message;
}

export function AuthForm({ mode }: { mode: Mode }) {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);
  const copy = COPY[mode];

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
        setInfo('Almost done — we sent a confirmation link to your email. Open it on this device to start your paper.');
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

  return (
    <div>
      <h1 className="headline" style={{ fontSize: 'clamp(2.4rem, 9vw, 3.4rem)' }}>
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
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              autoComplete={mode === 'login' ? 'current-password' : 'new-password'}
              minLength={mode === 'login' ? undefined : 8}
              required
            />
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
