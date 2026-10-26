import { NextResponse } from 'next/server';
import { getSessionUser } from '@/lib/auth';
import { sql } from '@/lib/db';

/** Story links go through here so the reader's history is recorded, then on to the article. */
export async function GET(request: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const articleId = Number(id);
  const [article] = Number.isSafeInteger(articleId) ? await sql<{ url: string }[]>`select url from app.articles where id = ${articleId}` : [];
  if (!article) return NextResponse.redirect(new URL('/', request.url));
  const user = await getSessionUser().catch(() => null);
  if (user) {
    const edition = Number(new URL(request.url).searchParams.get('e')) || null;
    await sql`
      insert into app.reads (user_id, article_id, edition_id)
      select ${user.id}, ${articleId}, ${edition} where exists (select 1 from app.user_articles where user_id = ${user.id} and article_id = ${articleId})
      on conflict (user_id, article_id) do update set read_at = now()`.catch(() => {});
  }
  return NextResponse.redirect(article.url, 302);
}
