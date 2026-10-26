export const USER_AGENT =
  'Mozilla/5.0 (compatible; MorningDigest/1.0; +https://github.com/tapariapurv/daily-digest-feed) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0 Safari/537.36';

const MAX_BYTES = 6 * 1024 * 1024;

export type FetchedText = {
  status: number;
  url: string;
  contentType: string;
  text: string;
  headers: Headers;
};

/** GET a URL as text with a hard timeout and size cap. Never throws on HTTP status, only on network/timeout. */
export async function fetchText(
  url: string,
  opts: { timeoutMs?: number; headers?: Record<string, string>; accept?: string } = {},
): Promise<FetchedText> {
  const res = await fetch(url, {
    redirect: 'follow',
    signal: AbortSignal.timeout(opts.timeoutMs ?? 10_000),
    headers: {
      'user-agent': USER_AGENT,
      accept:
        opts.accept ??
        'application/rss+xml, application/atom+xml, application/feed+json, application/xml;q=0.9, text/xml;q=0.9, text/html;q=0.8, */*;q=0.5',
      'accept-language': 'en;q=0.9, *;q=0.5',
      ...opts.headers,
    },
  });
  let text = '';
  if (res.body && res.status !== 304) {
    const reader = res.body.getReader();
    const chunks: Uint8Array[] = [];
    let size = 0;
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > MAX_BYTES) {
        await reader.cancel();
        break;
      }
      chunks.push(value);
    }
    const charset = /charset=["']?([\w-]+)/i.exec(res.headers.get('content-type') ?? '')?.[1] ?? 'utf-8';
    let decoder: TextDecoder;
    try {
      decoder = new TextDecoder(charset);
    } catch {
      decoder = new TextDecoder('utf-8');
    }
    text = decoder.decode(Buffer.concat(chunks));
  }
  return {
    status: res.status,
    url: res.url || url,
    contentType: res.headers.get('content-type') ?? '',
    text,
    headers: res.headers,
  };
}

export function describeFetchError(err: unknown): string {
  if (err instanceof Error) {
    if (err.name === 'TimeoutError' || err.name === 'AbortError') return 'Timed out';
    const cause = (err as Error & { cause?: { code?: string } }).cause;
    if (cause?.code === 'ENOTFOUND') return 'Domain not found';
    if (cause?.code === 'ECONNREFUSED') return 'Connection refused';
    if (cause?.code) return `Network error (${cause.code})`;
    return err.message;
  }
  return String(err);
}
