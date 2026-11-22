import type { MetadataRoute } from 'next';

/**
 * Makes Club OS installable to the home screen (piece 6). The name stays
 * "Club OS" for every club: one app, the club is chosen by signing in.
 */
export default function manifest(): MetadataRoute.Manifest {
  // `handle_links` and `launch_handler` are newer than Next's type.
  const manifest: MetadataRoute.Manifest & { handle_links: string; launch_handler: { client_mode: string[] } } = {
    id: '/',
    name: 'Club OS',
    short_name: 'Club OS',
    description: 'Sessions, availability and training load for your team.',
    start_url: '/start',
    scope: '/',
    display: 'standalone',
    // Android and desktop: links of this app open in the installed app, reusing its window.
    handle_links: 'preferred',
    launch_handler: { client_mode: ['navigate-existing', 'auto'] },
    orientation: 'portrait',
    background_color: '#0e0f11',
    theme_color: '#0e0f11',
    icons: [
      { src: '/icons/icon-192.png', sizes: '192x192', type: 'image/png', purpose: 'any' },
      { src: '/icons/icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'any' },
      { src: '/icons/icon-maskable-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
    ],
  };
  return manifest;
}
