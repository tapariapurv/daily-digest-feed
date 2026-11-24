// Simulates a day of 10-minute Apps Script wakes and counts calls to the app.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';

function day(serverNext: number | undefined, newMailAt: number[] = []) {
  let now = Date.UTC(2026, 10, 24, 0, 0);
  const calls: string[] = [];
  const store: Record<string, string> = {};
  let unread = 0;
  const ctx = {
    Date: { now: () => now },
    JSON,
    PropertiesService: { getScriptProperties: () => ({ getProperty: (k: string) => store[k] ?? null, setProperty: (k: string, v: string) => (store[k] = v) }) },
    UrlFetchApp: {
      fetch: (url: string, o: { payload?: string }) => {
        calls.push(url.endsWith('tick') ? 'tick' : 'mail');
        if (url.endsWith('tick') && serverNext) serverNext += 86_400_000; // the app moves a claimed reader to tomorrow
        const body = JSON.parse(o.payload ?? '{}');
        const work = { inboxes: ['a+x@g.com'], outbox: [] as unknown[], ...(serverNext === undefined ? {} : { next: serverNext }) };
        return { getResponseCode: () => 200, getContentText: () => JSON.stringify(body.issue || body.sent ? { ok: true } : work) };
      },
    },
    ScriptApp: { getOAuthToken: () => 't' },
    GmailApp: {
      getUserLabelByName: () => ({}),
      search: (_q: string, _s: number, max: number) => {
        const hits = unread ? [{ getMessages: () => [], addLabel: () => (unread = 0) }] : [];
        return hits;
      },
      sendEmail: () => {},
    },
  };
  vm.createContext(ctx);
  vm.runInContext(readFileSync('scheduler/Code.js', 'utf8'), ctx);
  for (let i = 0; i < 144; i++, now += 600_000) {
    if (newMailAt.includes(i)) unread = 1;
    (ctx as unknown as { tick: () => void }).tick();
  }
  return { ticks: calls.filter((c) => c === 'tick').length, mail: calls.filter((c) => c === 'mail').length, start: Date.UTC(2026, 10, 24, 0, 0) };
}

test('idle day with one edition: few calls, one tick', () => {
  const r = day(Date.UTC(2026, 10, 24, 7, 0));
  assert.ok(r.ticks >= 1 && r.ticks <= 3, `ticks ${r.ticks}`);
  assert.ok(r.mail <= 52, `mail ${r.mail}`); // 48 refreshes + post-run checks
});

test('new newsletter mail triggers a sync on that wake', () => {
  const base = day(null as unknown as number).mail;
  assert.equal(day(null as unknown as number, [5]).mail, base + 1);
});

test('app without `next` keeps the old every-wake tick', () => {
  assert.ok(day(undefined).ticks >= 140);
});
