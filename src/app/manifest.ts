import type { MetadataRoute } from 'next';

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: 'Morning Digest',
    short_name: 'Digest',
    description: 'Your morning paper, written from everything you follow.',
    start_url: '/',
    display: 'standalone',
    background_color: '#f6f1e7',
    theme_color: '#f6f1e7',
    icons: [{ src: '/icon.svg', sizes: 'any', type: 'image/svg+xml' }],
  };
}
