import Link from 'next/link';
import { Paper } from '@/components/Paper';

export default function NotFound() {
  return (
    <Paper>
      <div className="shell">
        <section className="empty">
          <h1 className="headline">Nothing printed here.</h1>
          <Link href="/" className="btn btn-primary">
            Back to today
          </Link>
        </section>
      </div>
    </Paper>
  );
}
