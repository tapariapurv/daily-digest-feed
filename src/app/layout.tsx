import type { Metadata, Viewport } from 'next';
import { Bricolage_Grotesque, IBM_Plex_Mono, Instrument_Serif, JetBrains_Mono, Manrope, Newsreader, Playfair_Display, Source_Serif_4 } from 'next/font/google';
import './globals.css';

// Broadsheet fonts preload; the other templates' fonts load only when used.
const instrument = Instrument_Serif({ subsets: ['latin'], weight: '400', style: ['normal', 'italic'], variable: '--f-instrument' });
const newsreader = Newsreader({ subsets: ['latin'], style: ['normal', 'italic'], variable: '--f-newsreader' });
const plex = IBM_Plex_Mono({ subsets: ['latin'], weight: ['400', '500'], variable: '--f-plex' });
const bricolage = Bricolage_Grotesque({ subsets: ['latin'], variable: '--f-bricolage', preload: false });
const manrope = Manrope({ subsets: ['latin'], variable: '--f-manrope', preload: false });
const playfair = Playfair_Display({ subsets: ['latin'], style: ['normal', 'italic'], variable: '--f-playfair', preload: false });
const sourceSerif = Source_Serif_4({ subsets: ['latin'], style: ['normal', 'italic'], variable: '--f-sourceserif', preload: false });
const jetbrains = JetBrains_Mono({ subsets: ['latin'], weight: ['400', '700'], variable: '--f-jetbrains', preload: false });

const fontVars = [instrument, newsreader, plex, bricolage, manrope, playfair, sourceSerif, jetbrains].map((f) => f.variable).join(' ');

export const metadata: Metadata = {
  title: { default: 'Morning Digest', template: '%s · Morning Digest' },
  description: 'Everything you follow — blogs, newsletters, channels — summarised into one calm morning paper.',
  appleWebApp: { capable: true, title: 'Digest', statusBarStyle: 'default' },
};

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  viewportFit: 'cover',
  themeColor: [
    { media: '(prefers-color-scheme: light)', color: '#f6f1e7' },
    { media: '(prefers-color-scheme: dark)', color: '#14120f' },
  ],
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={fontVars}>
      <body>{children}</body>
    </html>
  );
}
