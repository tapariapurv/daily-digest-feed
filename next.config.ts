import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  serverExternalPackages: ['linkedom', '@mozilla/readability'],
  poweredByHeader: false,
};

export default nextConfig;
