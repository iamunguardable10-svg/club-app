import type { NextConfig } from 'next';

const isDev = process.env.NODE_ENV !== 'production';

/**
 * Where the app may talk to: itself and the Supabase project (REST, Auth,
 * Realtime over wss, Edge Functions, storage for photos). Address search goes through our own
 * /api/address, so Geoapify is not listed.
 */
function supabaseOrigins(): string[] {
  const raw = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim();
  if (!raw) return ['https://*.supabase.co', 'wss://*.supabase.co'];
  const url = new URL(raw);
  return [url.origin, `${url.protocol === 'http:' ? 'ws' : 'wss'}://${url.host}`];
}

// Next.js puts small inline scripts into every page, so scripts need
// 'unsafe-inline'; everything else is limited to our own origin.
const contentSecurityPolicy = [
  "default-src 'self'",
  `script-src 'self' 'unsafe-inline'${isDev ? " 'unsafe-eval'" : ''}`,
  "style-src 'self' 'unsafe-inline'",
  // Profile photos come from Supabase storage through signed links (0050).
  `img-src 'self' data: blob: ${supabaseOrigins()[0]}`,
  "font-src 'self' data:",
  `connect-src 'self' ${supabaseOrigins().join(' ')}${isDev ? ' ws://localhost:*' : ''}`,
  "worker-src 'self'",
  "manifest-src 'self'",
  "frame-src 'none'",
  "frame-ancestors 'none'",
  "object-src 'none'",
  "base-uri 'self'",
  "form-action 'self'",
  ...(isDev ? [] : ['upgrade-insecure-requests']),
].join('; ');

const securityHeaders = [
  { key: 'Content-Security-Policy', value: contentSecurityPolicy },
  { key: 'Strict-Transport-Security', value: 'max-age=63072000; includeSubDomains' },
  { key: 'X-Content-Type-Options', value: 'nosniff' },
  { key: 'X-Frame-Options', value: 'DENY' },
  { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
  { key: 'Permissions-Policy', value: 'camera=(), microphone=(), geolocation=(), payment=(), usb=(), interest-cohort=()' },
  { key: 'Cross-Origin-Opener-Policy', value: 'same-origin' },
];

const nextConfig: NextConfig = {
  reactStrictMode: true,
  poweredByHeader: false,
  env: {
    // Which build a report came from (piece 13): the commit on Vercel, "local" elsewhere.
    NEXT_PUBLIC_APP_VERSION: (process.env.VERCEL_GIT_COMMIT_SHA ?? 'local').slice(0, 7),
  },
  async headers() {
    return [{ source: '/:path*', headers: securityHeaders }];
  },
};

export default nextConfig;
