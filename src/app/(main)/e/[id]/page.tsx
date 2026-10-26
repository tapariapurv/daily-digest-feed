import { notFound } from 'next/navigation';
import { Edition } from '@/components/Edition';
import { getEditionView } from '@/lib/editions';

export const dynamic = 'force-dynamic';

export default async function EditionPage({ params }: PageProps<'/e/[id]'>) {
  const { id } = await params;
  const view = Number.isSafeInteger(Number(id)) ? await getEditionView(Number(id)) : null;
  if (!view) notFound();
  return <Edition view={view} />;
}
