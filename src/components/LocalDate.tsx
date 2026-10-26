'use client';

import { useEffect, useState } from 'react';

const FORMATS = {
  long: { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' },
  short: { day: 'numeric', month: 'short', year: 'numeric' },
} satisfies Record<string, Intl.DateTimeFormatOptions>;

/** Renders a date in the reader's own timezone (the server runs in UTC). */
export function LocalDate({ iso, format = 'long' }: { iso: string; format?: keyof typeof FORMATS }) {
  const [text, setText] = useState(() => new Date(iso).toLocaleDateString('en-GB', { ...FORMATS[format], timeZone: 'UTC' }));
  useEffect(() => setText(new Date(iso).toLocaleDateString(undefined, FORMATS[format])), [iso, format]);
  return <time dateTime={iso}>{text}</time>;
}

export function Greeting() {
  const [text, setText] = useState('Good morning');
  useEffect(() => {
    const h = new Date().getHours();
    setText(h < 5 ? 'Up late' : h < 12 ? 'Good morning' : h < 17 ? 'Good afternoon' : 'Good evening');
  }, []);
  return <>{text}</>;
}
