/**
 * Address suggestions for the hall address field, from Photon (komoot,
 * OpenStreetMap data; free, no key). Asked through this server so the
 * person's own address (IP) is not passed on; only the typed text is.
 */

import { parsePhotonResults, PHOTON_LANGUAGES } from '@/features/facilities/addressAutocomplete';

const PHOTON_URL = 'https://photon.komoot.io/api/';

export async function GET(request: Request) {
  const url = new URL(request.url);
  const query = (url.searchParams.get('q') ?? '').trim();
  if (query.length < 3 || query.length > 120) return Response.json({ results: [] });
  const lang = url.searchParams.get('lang') ?? '';
  const params = new URLSearchParams({ q: query, limit: '5' });
  if ((PHOTON_LANGUAGES as readonly string[]).includes(lang)) params.set('lang', lang);
  try {
    const response = await fetch(`${PHOTON_URL}?${params.toString()}`, {
      headers: { 'User-Agent': 'ClubOS (hall address suggestions)' },
      signal: AbortSignal.timeout(5000),
    });
    if (!response.ok) return Response.json({ results: [] }, { status: 502 });
    const results = parsePhotonResults(await response.json());
    // The same text gives the same places: let the edge keep them for a day.
    return Response.json({ results }, { headers: { 'Cache-Control': 'public, s-maxage=86400, max-age=3600' } });
  } catch {
    return Response.json({ results: [] }, { status: 502 });
  }
}
