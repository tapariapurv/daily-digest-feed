import Link from 'next/link';

export default function NotFound() {
  return (
    <div className="shell">
      <section className="empty">
        <h1 className="headline">Nothing printed here.</h1>
        <Link href="/" className="btn">
          Back to today
        </Link>
      </section>
    </div>
  );
}
