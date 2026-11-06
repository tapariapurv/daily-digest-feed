/** First frame while a page loads, so a tap responds immediately. */
export function PageSkeleton() {
  return (
    <div className="edition skeleton" aria-busy="true" aria-label="Loading">
      <div className="skeleton-line" style={{ width: '30%' }} />
      <div className="skeleton-title" />
      <div className="skeleton-media" />
      <div className="skeleton-line" />
      <div className="skeleton-line" />
      <div className="skeleton-line" style={{ width: '70%' }} />
    </div>
  );
}
