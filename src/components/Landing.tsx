import Link from 'next/link';
import { DEFAULT_READING } from '@/lib/profile';
import { SAMPLE_EDITION } from '@/lib/sample';
import { Edition } from './Edition';
import { Paper } from './Paper';

const FEATURES = [
  { title: 'Paste anything', body: 'Blogs, news sites, Substack, YouTube, Reddit — or just type “Stratechery”. Sites without feeds are scanned for new articles.' },
  { title: 'Summarised, not skimmed', body: 'Every piece becomes a 2–3 sentence brief with the actual point — numbers, names, decisions — grouped by topic.' },
  { title: 'Never the same story twice', body: 'Everything you’ve seen is remembered. Tomorrow’s paper only has what’s new.' },
  { title: 'Your paper, your way', body: 'Four templates, your colours, light or dark, quick or deep. Images on or off. Looks right on phone, iPad and desktop.' },
  { title: 'On your schedule', body: 'Pick the time and days. It’s printed before you wake up — and can land in your inbox as a newsletter.' },
  { title: 'Email newsletters too', body: 'Get a private address for email-only newsletters; every issue flows into the same calm page.' },
];

export function Landing() {
  return (
    <Paper>
      <div className="shell">
        <header className="topbar">
          <span className="wordmark">Morning Digest</span>
          <nav className="row" style={{ gap: '0.5rem' }}>
            <Link href="/login" className="btn btn-quiet btn-sm">
              Sign in
            </Link>
            <Link href="/signup" className="btn btn-primary btn-sm">
              Start free
            </Link>
          </nav>
        </header>
        <section className="masthead landing-hero reveal">
          <div className="masthead-inner">
            <p className="greeting">Good morning.</p>
            <h1 className="headline">Everything you follow, in one calm morning read.</h1>
            <p className="intro">
              Tell it which blogs, newsletters and channels you follow. Each morning it reads all of them, writes a short brief of every new piece,
              groups them by topic, and lays them out like a well-made newspaper — ready with your coffee.
            </p>
            <div className="row" style={{ marginTop: '1.8rem' }}>
              <Link href="/signup" className="btn btn-primary">
                Create your paper →
              </Link>
              <Link href="/login" className="btn btn-quiet">
                I have an account
              </Link>
            </div>
          </div>
        </section>

        <div className="feature-grid">
          {FEATURES.map((f) => (
            <div key={f.title} className="feature reveal">
              <h3>{f.title}</h3>
              <p>{f.body}</p>
            </div>
          ))}
        </div>

        <p className="meta" style={{ textAlign: 'center', margin: '3rem 0 1rem' }}>
          A sample edition
        </p>
        <div className="preview-frame">
          <div className="preview-bar">
            <i />
            <i />
            <i />
          </div>
          <Paper>
            <div className="shell">
              <Edition data={SAMPLE_EDITION} design={{ template: 'broadsheet', accent: null, mode: 'auto', textSize: 'm', density: 'comfortable', images: true }} reading={DEFAULT_READING} preview />
            </div>
          </Paper>
        </div>
        <p style={{ textAlign: 'center', marginTop: '2.5rem' }}>
          <Link href="/signup" className="btn btn-primary">
            Start your paper — it’s free
          </Link>
        </p>
      </div>
    </Paper>
  );
}
