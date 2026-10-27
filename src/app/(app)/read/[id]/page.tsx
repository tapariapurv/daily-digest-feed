import Link from 'next/link';
import { notFound } from 'next/navigation';
import { requireUser } from '@/lib/auth';
import { sql } from '@/lib/db';
import { timeAgo } from '@/lib/format';

export const dynamic = 'force-dynamic';

/** Read a newsletter issue that arrived by email, isolated in a sandboxed frame. */
export default async function ReadPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const user = await requireUser();
  const [issue] = Number.isSafeInteger(Number(id))
    ? await sql<{ title: string; author: string | null; published_at: Date | null; body_html: string | null; summary: string | null; source_title: string }[]>`
        select a.title, a.author, a.published_at, a.body_html, a.summary, ua.source_title
        from app.user_articles ua join app.articles a on a.id = ua.article_id
        where ua.user_id = ${user.id} and ua.article_id = ${Number(id)}`
    : [];
  if (!issue) notFound();
  const doc = issue.body_html
    ? `<!doctype html><html><head><meta charset="utf-8"><base target="_blank"><meta name="viewport" content="width=device-width,initial-scale=1"><style>body{margin:0;padding:16px;background:#fff;color:#111;font-family:system-ui,sans-serif}img{max-width:100%;height:auto}table{max-width:100%!important}</style></head><body>${issue.body_html}</body></html>`
    : null;
  return (
    <article className="reveal stack">
      <div className="page-head">
        <div>
          <p className="meta">
            {issue.author ?? issue.source_title} · {timeAgo(issue.published_at)}
          </p>
          <h1 className="page-title">{issue.title}</h1>
          {issue.summary && <p className="lede">{issue.summary}</p>}
        </div>
      </div>
      {doc ? (
        <iframe
          title={issue.title}
          srcDoc={doc}
          sandbox="allow-popups allow-popups-to-escape-sandbox"
          style={{ width: '100%', height: '80vh', border: '1px solid var(--rule)', borderRadius: 'var(--radius)', background: '#fff' }}
        />
      ) : (
        <p className="muted">The original email is no longer stored.</p>
      )}
      <p>
        <Link href="/" className="btn btn-quiet">
          ← Back to today
        </Link>
      </p>
    </article>
  );
}
