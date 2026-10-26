import { NextResponse } from 'next/server';
import { getSessionUser, type SessionUser } from './auth';

export function json(data: unknown, status = 200) {
  return NextResponse.json(data, { status, headers: { 'cache-control': 'no-store' } });
}

type Handler<C> = (user: SessionUser, request: Request, ctx: C) => Promise<Response>;

/** Wrap a route handler so it only runs for a signed-in user. */
export function withUser<C = unknown>(handler: Handler<C>) {
  return async (request: Request, ctx: C) => {
    const user = await getSessionUser();
    if (!user) return json({ error: 'Not signed in' }, 401);
    try {
      return await handler(user, request, ctx);
    } catch (err) {
      console.error(err);
      return json({ error: err instanceof Error ? err.message : 'Something went wrong' }, 500);
    }
  };
}

export async function readJson<T>(request: Request): Promise<Partial<T>> {
  try {
    return (await request.json()) as Partial<T>;
  } catch {
    return {};
  }
}
