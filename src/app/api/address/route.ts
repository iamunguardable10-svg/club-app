/**
 * Address suggestions for the hall address field, from Geoapify. The key
 * (`GEOAPIFY_API_KEY`) stays on this server and is never sent to the browser;
 * asking through here also keeps the person's own address (IP) from
 * Geoapify: only the typed text goes out. Without the key: no suggestions.
 */

import { parseGeoapifyResults } from '@/features/facilities/addressAutocomplete';

const GEOAPIFY_URL = 'https://api.geoapify.com/v1/geocode/autocomplete';

export async function GET(request: Request) {
  const url = new URL(request.url);
  const query = (url.searchParams.get('q') ?? '').trim();
  const apiKey = process.env.GEOAPIFY_API_KEY?.trim();
  if (!apiKey || query.length < 3 || query.length > 120) return Response.json({ results: [] });
  const lang = url.searchParams.get('lang') ?? '';
  const params = new URLSearchParams({ text: query, format: 'json', limit: '5', lang: /^[a-z]{2}$/.test(lang) ? lang : 'en', apiKey });
  try {
    const response = await fetch(`${GEOAPIFY_URL}?${params.toString()}`, { signal: AbortSignal.timeout(5000) });
    if (!response.ok) return Response.json({ results: [] }, { status: 502 });
    const results = parseGeoapifyResults(await response.json());
    // The same text gives the same places: let the edge keep them for a day.
    return Response.json({ results }, { headers: { 'Cache-Control': 'public, s-maxage=86400, max-age=3600' } });
  } catch {
    return Response.json({ results: [] }, { status: 502 });
  }
}
