import Link from 'next/link';
import type { EditionData, StoryItem } from '@/lib/editions';
import { hostname, timeAgo } from '@/lib/format';
import type { Design, Reading } from '@/lib/profile';
import { Greeting, LocalDate } from './LocalDate';
import { SaveButton, Thumb } from './StoryBits';

type Props = { data: EditionData; design: Design; reading: Reading; preview?: boolean };

function Story({ item, props, big }: { item: StoryItem; props: Props & { read: Set<number>; saved: Set<number> }; big?: boolean }) {
  const { design, reading, data, preview } = props;
  const href = preview ? item.url : `/r/${item.id}?e=${data.edition.id}`;
  const when = timeAgo(item.published_at);
  const showImage = design.images && !!item.image_url && design.template !== 'wire';
  const read = props.read.has(item.id);
  const body =
    reading.summaryStyle === 'headline' ? null : reading.summaryStyle === 'tldr' ? item.tldr ?? item.summary : item.summary ?? item.tldr;
  return (
    <article className={`story${showImage ? ' has-media' : ''}${read ? ' is-read' : ''}`}>
      {showImage && <Thumb src={item.image_url!} href={href} eager={big} />}
      <div className="story-body">
        <div className="meta">
          <span className="src">{item.source_title}</span>
          {item.author && item.author !== item.source_title && <span>{item.author}</span>}
          {when && <span>{when}</span>}
          {read && <span className="read-mark">✓ Read</span>}
          <SaveButton articleId={item.id} initial={props.saved.has(item.id)} disabled={preview} />
        </div>
        <h3 className="story-title">
          <a href={href} target="_blank" rel="noopener noreferrer">
            {item.title}
          </a>
        </h3>
        {body && <p className="summary">{body}</p>}
        {reading.summaryStyle === 'detailed' && !!item.key_points?.length && (
          <ul className="points">
            {item.key_points.map((p) => (
              <li key={p}>{p}</li>
            ))}
          </ul>
        )}
      </div>
    </article>
  );
}

const pad = (n: number) => String(n).padStart(2, '0');

export function Edition(props: Props) {
  const { data, preview } = props;
  const { edition, number, readMinutes } = data;
  const items = new Map(data.items.map((i) => [i.id, i]));
  const full = { ...props, read: new Set(data.readIds), saved: new Set(data.savedIds) };
  const pick = (ids: number[]) => ids.map((id) => items.get(Number(id))).filter((i): i is StoryItem => !!i);
  const layout = edition.layout;
  const lead = pick(layout.lead ?? []);
  const sections = (layout.sections ?? []).map((s) => ({ title: s.title, items: pick(s.ids) })).filter((s) => s.items.length);
  const briefly = pick(layout.briefly ?? []);
  const storyCount = lead.length + sections.reduce((n, s) => n + s.items.length, 0);

  return (
    <article>
      <header className="masthead reveal">
        <div className="masthead-inner">
          <div className="dateline meta">
            <span>
              <LocalDate iso={edition.created_at} />
            </span>
            <span>No. {number}</span>
            <span>
              {storyCount} stor{storyCount === 1 ? 'y' : 'ies'} · {edition.source_count} source{edition.source_count === 1 ? '' : 's'}
            </span>
            <span>{readMinutes} min read</span>
          </div>
          <p className="greeting">
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
          <div className="story-list">
            {lead.map((item, i) => (
              <Story key={item.id} item={item} props={full} big={i === 0} />
            ))}
          </div>
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
          <div className="story-list">
            {s.items.map((item) => (
              <Story key={item.id} item={item} props={full} />
            ))}
          </div>
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
                <a href={preview ? item.url : `/r/${item.id}?e=${edition.id}`} target="_blank" rel="noopener noreferrer">
                  {item.title}
                </a>
                <span className="meta">{item.source_title || hostname(item.url)}</span>
              </li>
            ))}
          </ul>
        </section>
      )}

      {!preview && (
        <footer className="edition-foot">
          {data.prevId ? <Link href={`/e/${data.prevId}`}>← Previous</Link> : <span />}
          <Link href="/library?tab=editions">All editions</Link>
          {data.nextId ? <Link href={`/e/${data.nextId}`}>Next →</Link> : <span />}
        </footer>
      )}
      <p className="colophon">That’s everything. Enjoy the coffee.</p>
    </article>
  );
}
