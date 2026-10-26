'use client';

import { useEffect, useState } from 'react';
import type { EditionData } from '@/lib/editions';
import type { Profile } from '@/lib/profile';
import type { SourceView } from '@/lib/sources';
import { DesignStudio } from './DesignStudio';
import { ScheduleEditor } from './SettingsForm';
import { SourcesManager } from './SourcesManager';

const STEPS = ['You', 'Sources', 'Look', 'Delivery'];

async function saveProfile(patch: Record<string, unknown>) {
  const res = await fetch('/api/profile', { method: 'PUT', headers: { 'content-type': 'application/json' }, body: JSON.stringify(patch) });
  const body = await res.json();
  if (!res.ok) throw new Error(body.error ?? `HTTP ${res.status}`);
  return body.profile as Profile;
}

export function Onboarding({ profile, sources, sample }: { profile: Profile; sources: SourceView[]; sample: EditionData }) {
  const [step, setStep] = useState(0);
  const [name, setName] = useState(profile.paper_name);
  const [interests, setInterests] = useState(profile.interests);
  const [count, setCount] = useState(sources.length);
  const [schedule, setSchedule] = useState(profile.schedule);
  const [emailDelivery, setEmailDelivery] = useState(profile.email_delivery);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Default the schedule to the reader's own time zone.
  useEffect(() => {
    if (profile.schedule.timezone === 'UTC') {
      const tz = Intl.DateTimeFormat().resolvedOptions().timeZone;
      if (tz) setSchedule((s) => ({ ...s, timezone: tz }));
    }
  }, [profile.schedule.timezone]);

  async function next(patch?: Record<string, unknown>) {
    setError(null);
    setBusy(true);
    try {
      if (patch) await saveProfile(patch);
      setStep((s) => s + 1);
      window.scrollTo({ top: 0, behavior: 'smooth' });
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  }

  async function finish() {
    setBusy(true);
    setError(null);
    try {
      await saveProfile({ schedule, email_delivery: emailDelivery, onboarded: true });
      await fetch('/api/run', { method: 'POST' });
      window.location.href = '/';
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
      setBusy(false);
    }
  }

  return (
    <div className="reveal" style={{ paddingTop: '1rem' }}>
      <div className="steps-bar" aria-label={`Step ${step + 1} of ${STEPS.length}`}>
        {STEPS.map((s, i) => (
          <i key={s} className={i <= step ? 'on' : ''} />
        ))}
      </div>
      <p className="meta">
        Step {step + 1} of {STEPS.length} · {STEPS[step]}
      </p>

      {step === 0 && (
        <div className="stack-lg" style={{ maxWidth: '40rem' }}>
          <h1 className="headline">Let’s set up your morning paper.</h1>
          <label className="field">
            <span>Name it</span>
            <input type="text" value={name} maxLength={60} onChange={(e) => setName(e.target.value)} />
          </label>
          <label className="field">
            <span>What do you care about? (optional, but it makes a big difference)</span>
            <textarea
              value={interests}
              onChange={(e) => setInterests(e.target.value)}
              maxLength={1500}
              placeholder="e.g. Product manager in fintech. Care about AI, payments, startups and design. Skip sports and celebrity news."
            />
          </label>
          <div>
            <button className="btn btn-primary" type="button" disabled={busy} onClick={() => next({ paper_name: name, interests })}>
              Continue →
            </button>
          </div>
        </div>
      )}

      {step === 1 && (
        <div className="stack-lg">
          <div>
            <h1 className="headline">Where should your news come from?</h1>
            <p className="lede">Type names, paste links, or tap a starter pack. You can change this any time.</p>
          </div>
          <SourcesManager initial={sources} compact onChange={(s) => setCount(s.length)} />
          <div className="save-bar">
            <button className="btn btn-quiet" type="button" onClick={() => setStep(0)}>
              ← Back
            </button>
            <button className="btn btn-primary" type="button" disabled={!count} onClick={() => next()}>
              {count ? `Continue with ${count} source${count === 1 ? '' : 's'} →` : 'Add at least one source'}
            </button>
          </div>
        </div>
      )}

      {step === 2 && (
        <div className="stack-lg">
          <div>
            <h1 className="headline">How should it look?</h1>
            <p className="lede">Pick a template and length. You can fine-tune everything later in Design.</p>
          </div>
          <DesignStudio
            initialDesign={profile.design}
            initialReading={profile.reading}
            initialName={name}
            sample={sample}
            usingOwn={false}
            onboarding
            onSaved={() => setStep(3)}
          />
        </div>
      )}

      {step === 3 && (
        <div className="stack-lg" style={{ maxWidth: '40rem' }}>
          <div>
            <h1 className="headline">When should it arrive?</h1>
            <p className="lede">Your paper is printed a few minutes before each delivery time.</p>
          </div>
          <div className="panel">
            <ScheduleEditor value={schedule} onChange={setSchedule} />
          </div>
          <label className="switch panel">
            <span>
              <strong style={{ display: 'block' }}>Also email it to me</strong>
              <span className="hint" style={{ margin: 0 }}>
                A newsletter version in your inbox{profile.email ? ` at ${profile.email}` : ''}.
              </span>
            </span>
            <input type="checkbox" checked={emailDelivery} onChange={(e) => setEmailDelivery(e.target.checked)} />
          </label>
          <div className="save-bar">
            <button className="btn btn-quiet" type="button" onClick={() => setStep(2)}>
              ← Back
            </button>
            <button className="btn btn-primary" type="button" disabled={busy} onClick={finish}>
              {busy ? 'Printing your first edition…' : 'Print my first edition →'}
            </button>
          </div>
        </div>
      )}
      {error && <p className="note error-text">{error}</p>}
    </div>
  );
}
