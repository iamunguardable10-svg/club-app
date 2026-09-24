import type { MetadataRoute } from 'next';

/**
 * Makes Club OS installable to the home screen (piece 6). The name stays
 * "Club OS" for every club: one app, the club is chosen by signing in.
 */
export default function manifest(): MetadataRoute.Manifest {
  return {
    id: '/',
    name: 'Club OS',
    short_name: 'Club OS',
    description: 'Sessions, availability and training load for your team.',
    start_url: '/',
    scope: '/',
    display: 'standalone',
    orientation: 'portrait',
    background_color: '#050712',
    theme_color: '#050712',
    icons: [
      { src: '/icons/icon-192.png', sizes: '192x192', type: 'image/png', purpose: 'any' },
      { src: '/icons/icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'any' },
      { src: '/icons/icon-maskable-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
    ],
  };
}
