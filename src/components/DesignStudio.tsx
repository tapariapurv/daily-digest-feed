'use client';

import { useRouter } from 'next/navigation';
import { useMemo, useState } from 'react';
import type { EditionData } from '@/lib/editions';
import { ACCENTS, READING_PRESETS, TEMPLATES, type Design, type Reading } from '@/lib/profile';
import { Edition } from './Edition';
import { Paper } from './Paper';

// Little previews of each template on the picker cards.
const SWATCH: Record<string, { bg: string; ink: string; font: string; glyph: string }> = {
  broadsheet: { bg: '#f6f1e7', ink: '#1c1a17', font: 'var(--f-instrument), Georgia, serif', glyph: 'Aa' },
  modern: { bg: '#ffffff', ink: '#111418', font: 'var(--f-bricolage), system-ui, sans-serif', glyph: 'Aa' },
  magazine: { bg: '#fffdf8', ink: '#151311', font: 'var(--f-playfair), Georgia, serif', glyph: 'Aa' },
  wire: { bg: '#0b0d0c', ink: '#d7e3d9', font: 'var(--f-jetbrains), monospace', glyph: '>_' },
  paper: { bg: '#efe6d2', ink: '#2a2419', font: 'var(--f-sourceserif), Georgia, serif', glyph: 'Aa' },
  leather: { bg: 'radial-gradient(circle at 30% 20%, #5a2a20, #2a120d)', ink: '#e8cf94', font: 'var(--f-playfair), Georgia, serif', glyph: 'Aa' },
};

function Segmented<T extends string>({ value, options, onChange, label }: { value: T; options: { value: T; label: string }[]; onChange: (v: T) => void; label: string }) {
  return (
    <div className="segmented" role="group" aria-label={label}>
      {options.map((o) => (
        <button key={o.value} type="button" aria-pressed={value === o.value} onClick={() => onChange(o.value)}>
          {o.label}
        </button>
      ))}
    </div>
  );
}

export function DesignStudio({
  initialDesign,
  initialReading,
  initialName,
  sample,
  usingOwn,
  onboarding,
  onSaved,
}: {
  initialDesign: Design;
  initialReading: Reading;
  initialName: string;
  sample: EditionData;
  usingOwn: boolean;
  onboarding?: boolean;
  onSaved?: () => void;
}) {
  const router = useRouter();
  const [design, setDesign] = useState(initialDesign);
  const [reading, setReading] = useState(initialReading);
  const [name, setName] = useState(initialName);
  const [status, setStatus] = useState<{ ok: boolean; msg: string } | null>(null);
  const [saving, setSaving] = useState(false);
  const dirty = useMemo(
    () => JSON.stringify([design, reading, name]) !== JSON.stringify([initialDesign, initialReading, initialName]),
    [design, reading, name, initialDesign, initialReading, initialName],
  );
  const d = (patch: Partial<Design>) => setDesign({ ...design, ...patch });
  const template = TEMPLATES.find((t) => t.id === design.template)!;

  async function save() {
    setSaving(true);
    setStatus(null);
    try {
      const res = await fetch('/api/profile', {
        method: 'PUT',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ design, reading, paper_name: name }),
      });
      const body = await res.json();
      if (!res.ok) throw new Error(body.error ?? `HTTP ${res.status}`);
      setStatus({ ok: true, msg: 'Saved — your paper now looks like this.' });
      onSaved?.();
      router.refresh();
    } catch (err) {
      setStatus({ ok: false, msg: err instanceof Error ? err.message : String(err) });
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="reveal">
      {!onboarding && (
        <div className="page-head">
          <div>
            <h1 className="page-title">Design your paper</h1>
            <p className="lede">Pick a template, colours and length. The preview updates as you go{usingOwn ? ' — it’s your latest edition' : ''}.</p>
          </div>
        </div>
      )}
      <div className="studio">
        <div className="studio-controls stack-lg">
          <div>
            <span className="label">Name</span>
            <input type="text" value={name} maxLength={60} onChange={(e) => setName(e.target.value)} aria-label="Name of your paper" />
          </div>

          <div>
            <span className="label">Template</span>
            <div className="template-grid">
              {TEMPLATES.map((t) => {
                const sw = SWATCH[t.id];
                return (
                  <button key={t.id} type="button" className="template-card" aria-pressed={design.template === t.id} onClick={() => d({ template: t.id, accent: null })}>
                    <div className="swatch" style={{ background: sw.bg, color: sw.ink, fontFamily: sw.font }}>
                      <span>
                        {sw.glyph}
                        <span style={{ color: t.accent }}>.</span>
                      </span>
                    </div>
                    <strong>{t.name}</strong>
                    <span>{t.blurb}</span>
                  </button>
                );
              })}
            </div>
          </div>

          <div>
            <span className="label">Accent colour</span>
            <div className="accent-row">
              <button
                type="button"
                className="accent-dot"
                style={{ background: template.accent }}
                aria-pressed={!design.accent}
                aria-label="Template default"
                title="Template default"
                onClick={() => d({ accent: null })}
              />
              {ACCENTS.filter((c) => c !== template.accent).map((c) => (
                <button key={c} type="button" className="accent-dot" style={{ background: c }} aria-pressed={design.accent === c} aria-label={c} onClick={() => d({ accent: c })} />
              ))}
              <input type="color" value={design.accent ?? template.accent} onChange={(e) => d({ accent: e.target.value })} aria-label="Custom colour" title="Custom colour" />
            </div>
          </div>

          <div>
            <span className="label">Appearance</span>
            <Segmented
              label="Appearance"
              value={design.mode}
              onChange={(mode) => d({ mode })}
              options={[
                { value: 'auto', label: 'Match device' },
                { value: 'light', label: 'Light' },
                { value: 'dark', label: 'Dark' },
              ]}
            />
          </div>

          <div className="row" style={{ alignItems: 'flex-start', gap: '1.2rem' }}>
            <div>
              <span className="label">Text size</span>
              <Segmented
                label="Text size"
                value={design.textSize}
                onChange={(textSize) => d({ textSize })}
                options={[
                  { value: 's', label: 'S' },
                  { value: 'm', label: 'M' },
                  { value: 'l', label: 'L' },
                ]}
              />
            </div>
            <div>
              <span className="label">Spacing</span>
              <Segmented
                label="Spacing"
                value={design.density}
                onChange={(density) => d({ density })}
                options={[
                  { value: 'comfortable', label: 'Airy' },
                  { value: 'compact', label: 'Compact' },
                ]}
              />
            </div>
          </div>

          <label className="switch">
            <span>
              <strong style={{ display: 'block' }}>Images</strong>
              <span className="hint" style={{ margin: 0 }}>
                {design.template === 'wire' ? 'The Wire template is text-only.' : 'Article pictures, loaded from the source sites.'}
              </span>
            </span>
            <input type="checkbox" checked={design.images} onChange={(e) => d({ images: e.target.checked })} />
          </label>

          <div>
            <span className="label">Length</span>
            <div className="stack" style={{ marginTop: 0 }}>
              <Segmented
                label="Length"
                value={reading.preset}
                onChange={(preset) => setReading(preset === 'custom' ? { ...reading, preset } : { ...reading, preset, ...READING_PRESETS[preset] })}
                options={[
                  { value: 'quick', label: 'Quick' },
                  { value: 'standard', label: 'Standard' },
                  { value: 'deep', label: 'Deep' },
                  { value: 'custom', label: 'Custom' },
                ]}
              />
              <p className="hint">{reading.preset === 'custom' ? 'Set your own limits below.' : READING_PRESETS[reading.preset].blurb}</p>
              {reading.preset === 'custom' && (
                <div className="stack">
                  <label className="field">
                    <span>Stories per edition: {reading.maxStories}</span>
                    <input type="range" min={3} max={60} value={reading.maxStories} onChange={(e) => setReading({ ...reading, maxStories: Number(e.target.value) })} style={{ width: '100%' }} />
                  </label>
                  <label className="field">
                    <span>New posts per source per edition: {reading.perSource}</span>
                    <input type="range" min={1} max={15} value={reading.perSource} onChange={(e) => setReading({ ...reading, perSource: Number(e.target.value) })} style={{ width: '100%' }} />
                  </label>
                  <div>
                    <span className="label">Each story shows</span>
                    <Segmented
                      label="Summary depth"
                      value={reading.summaryStyle}
                      onChange={(summaryStyle) => setReading({ ...reading, summaryStyle })}
                      options={[
                        { value: 'headline', label: 'Headline only' },
                        { value: 'tldr', label: 'One line' },
                        { value: 'summary', label: 'Summary' },
                        { value: 'detailed', label: 'Summary + key points' },
                      ]}
                    />
                  </div>
                </div>
              )}
              <label className="switch">
                <span>Include “Briefly noted” (one-line extras)</span>
                <input type="checkbox" checked={reading.briefly} onChange={(e) => setReading({ ...reading, briefly: e.target.checked })} />
              </label>
            </div>
          </div>

          <div className="save-bar">
            <button type="button" className="btn btn-primary" onClick={save} disabled={saving || (!dirty && !onboarding)}>
              {saving ? 'Saving…' : onboarding ? 'Use this design' : 'Save design'}
            </button>
            {dirty && !onboarding && (
              <button
                type="button"
                className="btn btn-quiet"
                onClick={() => {
                  setDesign(initialDesign);
                  setReading(initialReading);
                  setName(initialName);
                }}
              >
                Reset
              </button>
            )}
            {status && <span className={`note ${status.ok ? 'ok-text' : 'error-text'}`}>{status.msg}</span>}
          </div>
        </div>

        <div className="preview-frame" aria-label="Preview">
          <div className="preview-bar">
            <i />
            <i />
            <i />
            <span className="meta" style={{ marginLeft: '0.5rem' }}>
              Preview · {name || 'Your paper'}
            </span>
          </div>
          <Paper design={design}>
            <div className="shell">
              <div className="topbar">
                <span className="wordmark">{name || 'Your paper'}</span>
              </div>
              <Edition data={sample} design={design} reading={reading} preview />
            </div>
          </Paper>
        </div>
      </div>
    </div>
  );
}
