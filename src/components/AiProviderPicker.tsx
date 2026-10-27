'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';
import type { Profile } from '@/lib/profile';
import { PROVIDERS, providerInfo, type ProviderId } from '@/lib/providers';

/** Choose which AI writes your paper: the shared free Gemini, or your own provider and key. */
export function AiProviderPicker({ initial, compact }: { initial: Profile; compact?: boolean }) {
  const router = useRouter();
  const [provider, setProvider] = useState<ProviderId>(initial.ai.provider);
  const [key, setKey] = useState('');
  const [baseUrl, setBaseUrl] = useState(initial.ai.baseUrl ?? '');
  const [models, setModels] = useState<string[] | null>(null);
  const [model, setModel] = useState(initial.ai.model ?? '');
  const [busy, setBusy] = useState<'check' | 'save' | null>(null);
  const [status, setStatus] = useState<{ ok: boolean; msg: string } | null>(null);
  const [saved, setSaved] = useState(initial.ai);
  const info = providerInfo(provider);
  const hasSavedKey = initial.has_ai_key && saved.provider === provider;

  function choose(id: ProviderId) {
    setProvider(id);
    setModels(null);
    setStatus(null);
    setKey('');
    setModel(id === saved.provider ? saved.model ?? '' : '');
  }

  async function check() {
    setBusy('check');
    setStatus(null);
    try {
      const res = await fetch('/api/ai/models', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ provider, ai_key: key || undefined, baseUrl: baseUrl || undefined }),
      });
      const body = await res.json();
      if (!res.ok) throw new Error(body.error ?? `HTTP ${res.status}`);
      setModels(body.models);
      if (!model || !body.models.includes(model)) setModel(body.defaultModel ?? '');
      setStatus({ ok: true, msg: body.models.length ? `Key works — ${body.models.length} models available.` : 'Key works.' });
    } catch (err) {
      setModels(null);
      setStatus({ ok: false, msg: err instanceof Error ? err.message : String(err) });
    } finally {
      setBusy(null);
    }
  }

  async function save() {
    setBusy('save');
    setStatus(null);
    try {
      const res = await fetch('/api/profile', {
        method: 'PUT',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ ai: { provider, model: model || null, baseUrl: baseUrl || null }, ai_key: key || undefined }),
      });
      const body = await res.json();
      if (!res.ok) throw new Error(body.error ?? `HTTP ${res.status}`);
      setSaved(body.profile.ai);
      setKey('');
      setStatus({ ok: true, msg: provider === 'shared' ? 'Using the shared free Gemini.' : `Saved — your paper is now written by ${info.name}.` });
      router.refresh();
    } catch (err) {
      setStatus({ ok: false, msg: err instanceof Error ? err.message : String(err) });
    } finally {
      setBusy(null);
    }
  }

  const needsCheck = provider !== 'shared' && !models && !(hasSavedKey && model && !key && provider !== 'custom');
  const canSave = provider === 'shared' || (!!model && (!!key || hasSavedKey || !info.needsKey));
  const dirty = provider !== saved.provider || model !== (saved.model ?? '') || !!key || (provider === 'custom' && baseUrl !== (saved.baseUrl ?? ''));

  return (
    <div className="stack">
      {!compact && (
        <p className="note" style={{ margin: 0 }}>
          Now: <strong>{providerInfo(saved.provider).name}</strong>
          {saved.model ? ` · ${saved.model}` : ''}
        </p>
      )}
      {initial.ai_key_error && saved.provider !== 'shared' && (
        <p className="note error-text" style={{ margin: 0 }}>
          Your last edition used the shared key instead: {initial.ai_key_error}.
        </p>
      )}

      <div className="packs" role="radiogroup" aria-label="AI provider">
        {PROVIDERS.map((p) => (
          <button key={p.id} type="button" className="pack" role="radio" aria-checked={provider === p.id} aria-pressed={provider === p.id} onClick={() => choose(p.id)}>
            <strong style={{ fontSize: '1rem' }}>{p.name}</strong>
            <span>{p.note}</span>
          </button>
        ))}
      </div>

      {provider !== 'shared' && (
        <div className="stack">
          {provider === 'custom' && (
            <label className="field">
              <span>API address (OpenAI-compatible)</span>
              <input type="url" inputMode="url" value={baseUrl} onChange={(e) => setBaseUrl(e.target.value)} placeholder="https://api.deepseek.com/v1" spellCheck={false} />
            </label>
          )}
          <label className="field">
            <span>
              {info.name} API key{!info.needsKey ? ' (if your endpoint needs one)' : ''}
            </span>
            <input
              type="password"
              value={key}
              onChange={(e) => {
                setKey(e.target.value);
                setModels(null);
              }}
              placeholder={hasSavedKey ? '•••••••• saved — paste a new one to replace' : 'Paste your key'}
              autoComplete="off"
              spellCheck={false}
            />
          </label>
          {info.keyUrl && (
            <p className="hint">
              Get one at{' '}
              <a href={info.keyUrl} target="_blank" rel="noreferrer">
                {new URL(info.keyUrl).hostname}
              </a>
              . It’s stored encrypted and only used for your paper.
            </p>
          )}

          {models && models.length > 0 ? (
            <label className="field">
              <span>Model</span>
              {models.length > 60 ? (
                <>
                  <input type="text" list="ai-models" value={model} onChange={(e) => setModel(e.target.value)} spellCheck={false} />
                  <datalist id="ai-models">
                    {models.map((m) => (
                      <option key={m} value={m} />
                    ))}
                  </datalist>
                </>
              ) : (
                <select value={model} onChange={(e) => setModel(e.target.value)}>
                  {models.map((m) => (
                    <option key={m} value={m}>
                      {m}
                    </option>
                  ))}
                </select>
              )}
            </label>
          ) : (
            models && (
              <label className="field">
                <span>Model name</span>
                <input type="text" value={model} onChange={(e) => setModel(e.target.value)} placeholder="e.g. deepseek-chat" spellCheck={false} />
              </label>
            )
          )}
          {hasSavedKey && !models && model && <p className="hint">Model: {model}</p>}
        </div>
      )}

      <div className="row">
        {needsCheck ? (
          <button type="button" className="btn btn-primary" onClick={check} disabled={busy !== null || (info.needsKey && !key && !hasSavedKey) || (provider === 'custom' && !baseUrl)}>
            {busy === 'check' ? 'Checking…' : 'Check key'}
          </button>
        ) : (
          <button type="button" className="btn btn-primary" onClick={save} disabled={busy !== null || !canSave || !dirty}>
            {busy === 'save' ? 'Saving…' : provider === 'shared' ? 'Use shared Gemini' : 'Save AI settings'}
          </button>
        )}
        {provider !== 'shared' && !needsCheck && (
          <button type="button" className="btn btn-quiet" onClick={check} disabled={busy !== null}>
            Reload models
          </button>
        )}
        {status && <span className={`note ${status.ok ? 'ok-text' : 'error-text'}`}>{status.msg}</span>}
      </div>
      {provider !== 'shared' && (
        <p className="hint">If your provider fails or runs out of quota, your paper still prints using the shared Gemini, and we’ll tell you here.</p>
      )}
    </div>
  );
}
