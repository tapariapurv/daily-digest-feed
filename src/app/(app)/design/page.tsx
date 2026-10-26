import { DesignStudio } from '@/components/DesignStudio';
import { requireUser } from '@/lib/auth';
import { getEditionData } from '@/lib/editions';
import { getProfile } from '@/lib/profiles';
import { SAMPLE_EDITION } from '@/lib/sample';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'Design' };

export default async function DesignPage() {
  const user = await requireUser();
  const [profile, latest] = await Promise.all([getProfile(user.id), getEditionData(user.id)]);
  return (
    <DesignStudio
      initialDesign={profile.design}
      initialReading={profile.reading}
      initialName={profile.paper_name}
      sample={latest && latest.items.length >= 3 ? latest : SAMPLE_EDITION}
      usingOwn={!!latest && latest.items.length >= 3}
    />
  );
}
