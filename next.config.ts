import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  reactStrictMode: true,
  env: {
    // Which build a report came from (piece 13): the commit on Vercel, "local" elsewhere.
    NEXT_PUBLIC_APP_VERSION: (process.env.VERCEL_GIT_COMMIT_SHA ?? 'local').slice(0, 7),
  },
};

export default nextConfig;
