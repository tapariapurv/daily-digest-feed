import Link from 'next/link';
import { hostOf } from '@/lib/text';
import { timeAgo, type EditionView, type StoryItem } from '@/lib/editions';
import { Greeting, LocalDate } from './LocalDate';

function Story({ item }: { item: StoryItem }) {
  const when = timeAgo(item.published_at ?? item.fetched_at);
  return (
    <div className="story">
      <div className="meta">
        <span className="src">{item.source_title}</span>
        {item.author && item.author !== item.source_title && <span>{item.author}</span>}
        {when && <span>{when}</span>}
      </div>
      <h3 className="story-title">
        <a href={item.url} target="_blank" rel="noopener noreferrer">
          {item.title}
          <span className="ext" aria-hidden>
            {' '}↗
          </span>
        </a>
      </h3>
      {item.summary && <p className="summary">{item.summary}</p>}
    </div>
  );
}

const pad = (n: number) => String(n).padStart(2, '0');

export function Edition({ view }: { view: EditionView }) {
  const { edition, items, number, readMinutes } = view;
  const pick = (ids: number[]) => ids.map((id) => items.get(Number(id))).filter((i): i is StoryItem => !!i);
  const layout = edition.layout;
  const lead = pick(layout.lead ?? []);
  const sections = (layout.sections ?? []).map((s) => ({ title: s.title, items: pick(s.ids) })).filter((s) => s.items.length);
  const briefly = pick(layout.briefly ?? []);
  const iso = new Date(edition.created_at).toISOString();

  return (
    <article>
      <header className="masthead reveal">
        <div className="masthead-inner">
          <div className="dateline">
            <span>
              <LocalDate iso={iso} />
            </span>
            <span>No. {number}</span>
            <span>
              {edition.item_count} stor{edition.item_count === 1 ? 'y' : 'ies'} · {edition.source_count} source{edition.source_count === 1 ? '' : 's'}
            </span>
            <span>{readMinutes} min read</span>
          </div>
          <p className="paper-name">
            <Greeting />.
          </p>
          <h1 className="headline">{edition.headline ?? 'Here’s what’s new'}</h1>
          {edition.intro && <p className="intro">{edition.intro}</p>}
          {sections.length > 1 && (
            <ul className="contents" aria-label="Sections">
              {sections.map((s, i) => (
                <li key={s.title}>
                  <a href={`#s-${i + 1}`}>
                    {s.title}
                    <span className="count">{s.items.length}</span>
                  </a>
                </li>
              ))}
            </ul>
          )}
        </div>
      </header>

      {lead.length > 0 && (
        <section className="section lead reveal" aria-labelledby="lead-title">
          <div className="section-head">
            <span className="section-num">★</span>
            <h2 className="section-title" id="lead-title">
              Don’t miss
            </h2>
          </div>
          {lead.map((item) => (
            <Story key={item.id} item={item} />
          ))}
        </section>
      )}

      {sections.map((s, i) => (
        <section key={s.title} id={`s-${i + 1}`} className="section reveal" aria-labelledby={`s-${i + 1}-title`}>
          <div className="section-head">
            <span className="section-num">{pad(i + 1)}</span>
            <h2 className="section-title" id={`s-${i + 1}-title`}>
              {s.title}
            </h2>
          </div>
          {s.items.map((item) => (
            <Story key={item.id} item={item} />
          ))}
        </section>
      ))}

      {briefly.length > 0 && (
        <section className="section reveal" aria-labelledby="briefly-title">
          <div className="section-head">
            <span className="section-num">+</span>
            <h2 className="section-title" id="briefly-title">
              Briefly noted
            </h2>
          </div>
          <ul className="briefly">
            {briefly.map((item) => (
              <li key={item.id}>
                <a href={item.url} target="_blank" rel="noopener noreferrer">
                  {item.title}
                </a>
                <span className="meta">{item.source_title || hostOf(item.url)}</span>
              </li>
            ))}
          </ul>
        </section>
      )}

      <footer className="edition-foot">
        {view.prevId ? <Link href={`/e/${view.prevId}`}>← Previous</Link> : <span />}
        <Link href="/archive">All editions</Link>
        {view.nextId ? <Link href={view.nextId ? `/e/${view.nextId}` : '/'}>Next →</Link> : <span />}
      </footer>
      <p className="colophon">That’s everything. Enjoy the coffee.</p>
    </article>
  );
}
