import manifest from '../manifest';

/**
 * The manifest while adding the app to the home screen from a signed-in
 * page: the same as /manifest.webmanifest, but the app starts with a
 * one-time code (`?handoff=`) that signs it in (see installHandoff.ts).
 */
export function GET(request: Request) {
  const code = new URL(request.url).searchParams.get('handoff') ?? '';
  const startUrl = /^[0-9a-f]{64}$/.test(code) ? `/?handoff=${code}` : '/';
  return new Response(JSON.stringify({ ...manifest(), start_url: startUrl }), {
    headers: { 'Content-Type': 'application/manifest+json', 'Cache-Control': 'no-store' },
  });
}
