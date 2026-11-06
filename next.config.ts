import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  serverExternalPackages: ['linkedom', '@mozilla/readability', 'imapflow', 'mailparser', 'nodemailer'],
  poweredByHeader: false,
  // Tab hopping reuses the page for 30s instead of refetching it. ponytail: a story saved within that window can lag in Library.
  experimental: { staleTimes: { dynamic: 30 } },
};

export default nextConfig;
