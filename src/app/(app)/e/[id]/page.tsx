import { notFound } from 'next/navigation';
import { Edition } from '@/components/Edition';
import { requireUser } from '@/lib/auth';
import { getEditionData } from '@/lib/editions';
import { getProfile } from '@/lib/profiles';

export const dynamic = 'force-dynamic';

export default async function EditionPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const user = await requireUser();
  const [profile, data] = await Promise.all([
    getProfile(user.id),
    Number.isSafeInteger(Number(id)) ? getEditionData(user.id, Number(id)) : null,
  ]);
  if (!data) notFound();
  return <Edition data={data} design={profile.design} reading={profile.reading} />;
}
