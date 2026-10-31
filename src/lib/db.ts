import { cert, getApps, initializeApp } from 'firebase-admin/app';
import { getAuth } from 'firebase-admin/auth';
import { FieldValue, getFirestore, Timestamp, type DocumentSnapshot, type Firestore } from 'firebase-admin/firestore';
import { createHash } from 'node:crypto';

// Server-only. FIREBASE_SERVICE_ACCOUNT holds the service-account JSON; Firestore rules deny all
// client access, so every read and write goes through here, scoped by the signed-in user's uid.
function app() {
  if (getApps()[0]) return getApps()[0];
  const raw = process.env.FIREBASE_SERVICE_ACCOUNT;
  return initializeApp(raw ? { credential: cert(JSON.parse(raw)) } : { projectId: 'daily-digest-feed' });
}

const g = globalThis as unknown as { __db?: Firestore };
export function db(): Firestore {
  if (!g.__db) {
    g.__db = getFirestore(app());
    g.__db.settings({ ignoreUndefinedProperties: true });
  }
  return g.__db;
}
export const adminAuth = () => getAuth(app());
export { FieldValue };

export const user = (uid: string) => db().collection('users').doc(uid);
export const profiles = () => db().collection('profiles');
export const articles = () => db().collection('articles');

/** Firestore Timestamps back to Dates (top level and one level of nesting is all we store). */
export function data<T>(snap: DocumentSnapshot): T {
  const out: Record<string, unknown> = { ...snap.data() };
  for (const [k, v] of Object.entries(out)) if (v instanceof Timestamp) out[k] = v.toDate();
  return out as T;
}
export const rows = <T>(snaps: { docs: DocumentSnapshot[] }) => snaps.docs.map((d) => data<T>(d));

/** Stable numeric article id from its dedupe key (52 bits: safe integer, collisions negligible). */
export const articleId = (dedupeKey: string) => parseInt(createHash('sha256').update(dedupeKey).digest('hex').slice(0, 13), 16);
/** Increasing numeric id for editions and runs. */
export const newId = () => Date.now() * 1000 + Math.floor(Math.random() * 1000);

/** Fetch many docs by id (Firestore caps getAll; chunk to be safe). */
export async function getMany<T>(ref: FirebaseFirestore.CollectionReference, ids: (string | number)[]): Promise<T[]> {
  const out: T[] = [];
  const unique = [...new Set(ids.map(String))];
  for (let i = 0; i < unique.length; i += 300) {
    const snaps = await db().getAll(...unique.slice(i, i + 300).map((id) => ref.doc(id)));
    for (const s of snaps) if (s.exists) out.push(data<T>(s));
  }
  return out;
}

/** Write many updates in batches of 400. */
export async function commitAll(ops: ((b: FirebaseFirestore.WriteBatch) => void)[]) {
  for (let i = 0; i < ops.length; i += 400) {
    const batch = db().batch();
    ops.slice(i, i + 400).forEach((op) => op(batch));
    await batch.commit();
  }
}
export type Source = {
  id: string;
  user_id: string;
  input_url: string;
  feed_url: string;
  site_url: string | null;
  title: string;
  kind: string;
  enabled: boolean;
  inbox_email: string | null;
  etag: string | null;
  last_modified: string | null;
  created_at: Date;
  last_fetched_at: Date | null;
  last_success_at: Date | null;
  last_error: string | null;
  consecutive_failures: number;
};

export type LedgerStatus = 'pending' | 'done' | 'skipped' | 'failed';
/** users/{uid}/ledger/{articleId}: everything this reader has seen — the no-duplicates guarantee. */
export type LedgerEntry = { article_id: number; source_id: string | null; source_title: string; status: LedgerStatus; edition_id: number | null; seen_at: Date };

export type Article = {
  body_html?: string | null;
  id: number;
  dedupe_key: string;
  url: string;
  title: string;
  author: string | null;
  source_title: string;
  published_at: Date | null;
  image_url: string | null;
  content: string | null;
  tldr: string | null;
  summary: string | null;
  key_points: string[] | null;
  topic: string | null;
  quality: number | null;
  summarized_at: Date | null;
  summary_attempts: number;
  created_at: Date;
};

export type EditionLayout = {
  lead: number[];
  sections: { title: string; ids: number[] }[];
  briefly: number[];
};

export type Edition = {
  id: number;
  user_id: string;
  created_at: Date;
  headline: string | null;
  intro: string | null;
  layout: EditionLayout;
  item_count: number;
  source_count: number;
  model: string | null;
  trigger: string | null;
  emailed_at: Date | null;
};

export type Run = {
  id: number;
  user_id: string;
  started_at: Date;
  finished_at: Date | null;
  trigger: string;
  status: 'running' | 'done' | 'error';
  stage: string | null;
  stats: Record<string, number | string>;
  error: string | null;
  edition_id: number | null;
};
