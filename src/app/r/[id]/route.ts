import { NextResponse } from 'next/server';
import { getSessionUser } from '@/lib/auth';
import { articles, user as userDoc } from '@/lib/db';
import { ledgerOf } from '@/lib/sources';

/** Story links go through here so the reader's history is recorded, then on to the article. */
export async function GET(request: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const articleId = Number(id);
  const snap = Number.isSafeInteger(articleId) ? await articles().doc(String(articleId)).get() : null;
  const article = snap?.exists ? (snap.data() as { url: string }) : null;
  if (!article) return NextResponse.redirect(new URL('/', request.url));
  const user = await getSessionUser().catch(() => null);
  if (user) {
    const edition = Number(new URL(request.url).searchParams.get('e')) || null;
    if ((await ledgerOf(user.id).doc(String(articleId)).get()).exists)
      await userDoc(user.id).collection('reads').doc(String(articleId)).set({ article_id: articleId, edition_id: edition, read_at: new Date() }).catch(() => {});
  }
  // Newsletter issues without a web version are read inside the app.
  if (!/^https?:\/\//.test(article.url)) return NextResponse.redirect(new URL(`/read/${articleId}`, request.url), 302);
  return NextResponse.redirect(article.url, 302);
}
