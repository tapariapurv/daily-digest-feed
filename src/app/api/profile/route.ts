import { json, readJson, withUser } from '@/lib/api';
import { encryptSecret } from '@/lib/crypto';
import { sql } from '@/lib/db';
import { normaliseDesign, normaliseReading, normaliseSchedule, type Design, type Reading, type Schedule } from '@/lib/profile';
import { getProfile, refreshNextRun } from '@/lib/profiles';

export const GET = withUser(async (user) => json({ profile: await getProfile(user.id) }));

type Body = {
  paper_name: string;
  interests: string;
  design: Partial<Design>;
  reading: Partial<Reading>;
  schedule: Partial<Schedule>;
  email_delivery: boolean;
  gemini_key: string;
  onboarded: boolean;
};

export const PUT = withUser(async (user, request) => {
  const body = await readJson<Body>(request);
  const current = await getProfile(user.id);

  if (typeof body.gemini_key === 'string') {
    const key = body.gemini_key.trim();
    if (key && key.length < 20) return json({ error: 'That doesn’t look like a Gemini API key.' }, 400);
    await sql`update app.profiles set gemini_key_enc = ${key ? encryptSecret(key) : null} where user_id = ${user.id}`;
  }

  const next = {
    paper_name: typeof body.paper_name === 'string' ? body.paper_name.trim().slice(0, 60) || 'The Morning Digest' : current.paper_name,
    interests: typeof body.interests === 'string' ? body.interests.trim().slice(0, 1500) : current.interests,
    design: body.design ? normaliseDesign({ ...current.design, ...body.design }) : current.design,
    reading: body.reading ? normaliseReading({ ...current.reading, ...body.reading }) : current.reading,
    schedule: body.schedule ? normaliseSchedule({ ...current.schedule, ...body.schedule }) : current.schedule,
    email_delivery: typeof body.email_delivery === 'boolean' ? body.email_delivery : current.email_delivery,
    onboarded: body.onboarded === true ? true : current.onboarded,
  };
  await sql`
    update app.profiles set paper_name = ${next.paper_name}, interests = ${next.interests},
      design = ${sql.json(next.design)}, reading = ${sql.json(next.reading)}, schedule = ${sql.json(next.schedule)},
      email_delivery = ${next.email_delivery}, onboarded = ${next.onboarded}, updated_at = now()
    where user_id = ${user.id}`;
  await refreshNextRun(user.id);
  return json({ profile: await getProfile(user.id) });
});
