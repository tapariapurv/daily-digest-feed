'use client';

import { useRouter } from 'next/navigation';
import { useEffect, useSyncExternalStore } from 'react';
import type { Run } from '@/lib/db';

type State = { run: Run | null; message: string | null; error: boolean };

// A tiny shared store so the nav button, the status strip and auto-refresh agree.
let state: State = { run: null, message: null, error: false };
const listeners = new Set<() => void>();
const set = (next: Partial<State>) => {
  state = { ...state, ...next };
  listeners.forEach((l) => l());
};
const subscribe = (l: () => void) => {
  listeners.add(l);
  return () => listeners.delete(l);
};
const serverState: State = { run: null, message: null, error: false };

let pollTimer: ReturnType<typeof setTimeout> | null = null;
let onFinished: ((run: Run) => void) | null = null;

async function poll(id: number) {
  try {
    const res = await fetch(`/api/run/${id}`, { cache: 'no-store' });
    const { run } = (await res.json()) as { run?: Run };
    if (!run) throw new Error('Run not found');
    set({ run });
    if (run.status === 'running') {
      pollTimer = setTimeout(() => poll(id), 2000);
      return;
    }
    const message =
      run.status === 'error'
        ? `Couldn’t finish: ${run.error ?? run.stage ?? 'unknown error'}`
        : run.edition_id
          ? 'Fresh edition ready.'
          : `${run.stage ?? 'Done'}.`;
    set({ run: null, message, error: run.status === 'error' });
    onFinished?.(run);
    setTimeout(() => set({ message: null, error: false }), run.status === 'error' ? 15000 : 6000);
  } catch {
    pollTimer = setTimeout(() => poll(id), 4000);
  }
}

export async function startRun() {
  if (state.run) return;
  set({ message: null, error: false, run: { id: 0, status: 'running', stage: 'Starting' } as Run });
  try {
    const res = await fetch('/api/run', { method: 'POST' });
    const body = (await res.json()) as { run?: Run; error?: string };
    if (!res.ok || !body.run) throw new Error(body.error ?? `HTTP ${res.status}`);
    set({ run: body.run });
    if (pollTimer) clearTimeout(pollTimer);
    poll(body.run.id);
  } catch (err) {
    set({ run: null, message: `Couldn’t start: ${err instanceof Error ? err.message : String(err)}`, error: true });
  }
}

function useRunState() {
  return useSyncExternalStore(subscribe, () => state, () => serverState);
}

function useFinishedHandler() {
  const router = useRouter();
  useEffect(() => {
    onFinished = (run) => {
      if (run.edition_id) router.push('/');
      router.refresh();
    };
  }, [router]);
}

export function RunButton() {
  const { run } = useRunState();
  useFinishedHandler();

  // Pick up a run already in progress (e.g. the morning cron) when the page opens.
  useEffect(() => {
    if (state.run) return;
    fetch('/api/run', { cache: 'no-store' })
      .then((r) => (r.ok ? r.json() : null))
      .then((body: { run?: Run | null } | null) => {
        if (body?.run?.status === 'running' && !state.run) {
          set({ run: body.run });
          poll(body.run.id);
        }
      })
      .catch(() => {});
  }, []);

  return (
    <button type="button" className="btn" onClick={startRun} disabled={!!run} title="Fetch new posts and build an edition now">
      {run ? <span className="pulse" aria-hidden /> : <span aria-hidden>↻</span>}
      {run ? 'Working' : 'Refresh'}
    </button>
  );
}

export function RunStatus() {
  const { run, message, error } = useRunState();
  if (!run && !message) return null;
  return (
    <div className={`runbar${error ? ' error' : ''}`} role="status" aria-live="polite">
      {run && <span className="pulse" aria-hidden />}
      <span>{run ? `${run.stage ?? 'Working'}…` : message}</span>
    </div>
  );
}

/** Starts a run once per browser session when the page decides today's edition is missing. */
export function AutoRun({ reason }: { reason: string }) {
  useEffect(() => {
    const key = `autorun:${reason}`;
    try {
      if (sessionStorage.getItem(key)) return;
      sessionStorage.setItem(key, '1');
    } catch {}
    startRun();
  }, [reason]);
  return null;
}
