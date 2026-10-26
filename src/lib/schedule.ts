import type { Schedule } from './profile.ts';

/** Offset (ms) of `timeZone` from UTC at the given instant. */
function tzOffsetMs(timeZone: string, at: Date): number {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone,
    hourCycle: 'h23',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  }).formatToParts(at);
  const get = (type: string) => Number(parts.find((p) => p.type === type)?.value);
  return Date.UTC(get('year'), get('month') - 1, get('day'), get('hour'), get('minute'), get('second')) - at.getTime();
}

/** The UTC instant of a wall-clock time in a timezone (handles DST transitions). */
export function zonedTimeToUtc(year: number, month: number, day: number, hour: number, minute: number, timeZone: string): Date {
  const guess = Date.UTC(year, month, day, hour, minute);
  const first = tzOffsetMs(timeZone, new Date(guess));
  let t = guess - first;
  const second = tzOffsetMs(timeZone, new Date(t));
  if (second !== first) t = guess - second;
  return new Date(t);
}

function localDate(at: Date, timeZone: string) {
  const parts = new Intl.DateTimeFormat('en-US', { timeZone, year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(at);
  const get = (type: string) => Number(parts.find((p) => p.type === type)?.value);
  return { year: get('year'), month: get('month') - 1, day: get('day') };
}

/** Next scheduled edition strictly after `from`, or null when the schedule is off. */
export function nextRunAfter(schedule: Schedule, from: Date = new Date()): Date | null {
  if (!schedule.enabled || !schedule.times.length || !schedule.days.length) return null;
  const today = localDate(from, schedule.timezone);
  let best: Date | null = null;
  for (let offset = 0; offset <= 8 && !best; offset++) {
    const d = new Date(Date.UTC(today.year, today.month, today.day + offset));
    if (!schedule.days.includes(d.getUTCDay())) continue;
    for (const time of schedule.times) {
      const [h, m] = time.split(':').map(Number);
      const at = zonedTimeToUtc(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate(), h, m, schedule.timezone);
      if (at > from && (!best || at < best)) best = at;
    }
  }
  return best;
}
