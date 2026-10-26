import { SourcesManager } from '@/components/SourcesManager';
import { requireUser } from '@/lib/auth';
import { listSources } from '@/lib/sources';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'Sources' };

export default async function SourcesPage() {
  const user = await requireUser();
  const sources = await listSources(user.id);
  return (
    <div className="reveal">
      <div className="page-head">
        <div>
          <h1 className="page-title">Sources</h1>
          <p className="lede">Where your paper gets its stories. Add, edit or pause anything, any time.</p>
        </div>
      </div>
      <SourcesManager initial={sources} />
    </div>
  );
}
