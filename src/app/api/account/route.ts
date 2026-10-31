import { cookies } from 'next/headers';
import { json, withUser } from '@/lib/api';
import { adminAuth, db, profiles, user as userDoc } from '@/lib/db';
import { SESSION_COOKIE } from '@/lib/firebase/config';

/** Delete everything this reader stored (sources, editions, history) and the account itself. */
export const DELETE = withUser(async (user) => {
  await db().recursiveDelete(userDoc(user.id));
  await profiles().doc(user.id).delete();
  await adminAuth().deleteUser(user.id).catch(() => {});
  (await cookies()).delete(SESSION_COOKIE);
  return json({ ok: true });
});
