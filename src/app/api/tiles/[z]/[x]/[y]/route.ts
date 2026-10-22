/**
 * Map tiles for the carpool meeting point (OpenStreetMap), through this
 * server: the person's address (IP) never reaches the tile server, and the
 * CDN keeps each tile so OpenStreetMap is asked rarely (its tile policy:
 * attribution shown on the map, a clear User-Agent, caching).
 */

const TILE_URL = 'https://tile.openstreetmap.org';
const USER_AGENT = 'ClubOS/1.0 (club app; carpool meeting point map)';

/** Only the app's own pages ask; other sites get nothing. */
function fromOwnPage(request: Request): boolean {
  const site = request.headers.get('sec-fetch-site');
  if (site) return site === 'same-origin';
  const origin = request.headers.get('origin') ?? request.headers.get('referer');
  if (!origin) return false;
  try {
    return new URL(origin).host === new URL(request.url).host;
  } catch {
    return false;
  }
}

export async function GET(request: Request, context: { params: Promise<{ z: string; x: string; y: string }> }) {
  if (!fromOwnPage(request)) return new Response(null, { status: 403 });
  const { z, x, y } = await context.params;
  const zoom = Number(z), column = Number(x), row = Number(y.replace(/\.png$/, ''));
  const size = 2 ** zoom;
  if (![zoom, column, row].every(Number.isInteger) || zoom < 0 || zoom > 19 || column < 0 || row < 0 || column >= size || row >= size) {
    return new Response(null, { status: 400 });
  }
  try {
    const response = await fetch(`${TILE_URL}/${zoom}/${column}/${row}.png`, { headers: { 'User-Agent': USER_AGENT }, signal: AbortSignal.timeout(8000) });
    if (!response.ok) return new Response(null, { status: 502 });
    return new Response(await response.arrayBuffer(), {
      headers: { 'Content-Type': 'image/png', 'Cache-Control': 'public, max-age=86400, s-maxage=604800, stale-while-revalidate=86400' },
    });
  } catch {
    return new Response(null, { status: 502 });
  }
}
