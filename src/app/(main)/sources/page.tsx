import { SourcesManager } from '@/components/SourcesManager';
import { listSources } from '@/lib/sources';

export const dynamic = 'force-dynamic';

export default async function SourcesPage() {
  const sources = await listSources();
  return <SourcesManager initial={JSON.parse(JSON.stringify(sources))} />;
}
