/**
 * Address suggestions for the hall address field, from Geoapify. The key
 * (`GEOAPIFY_API_KEY`) stays on this server and is never sent to the browser;
 * asking through here also keeps the person's own address (IP) from
 * Geoapify: only the typed text goes out. Without the key: no suggestions.
 */

import { parseGeoapifyResults } from '@/features/facilities/addressAutocomplete';

const GEOAPIFY_URL = 'https://api.geoapify.com/v1/geocode/autocomplete';

// Per server instance: 60 lookups per minute and caller (sliding window).
// Not shared between instances, but enough to stop a script from burning
// the Geoapify quota through us.
const WINDOW_MS = 60_000;
const LIMIT = 60;
const recent = new Map<string, number[]>();

function allowed(caller: string): boolean {
  const now = Date.now();
  const hits = (recent.get(caller) ?? []).filter((at) => at > now - WINDOW_MS);
  if (hits.length >= LIMIT) {
    recent.set(caller, hits);
    return false;
  }
  hits.push(now);
  recent.set(caller, hits);
  if (recent.size > 5000) {
    for (const [key, times] of recent) if (!times.some((at) => at > now - WINDOW_MS)) recent.delete(key);
  }
  return true;
}

/** Only the app's own pages ask; other sites and scripts get nothing. */
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

export async function GET(request: Request) {
  if (!fromOwnPage(request)) return Response.json({ results: [] }, { status: 403 });
  const caller = request.headers.get('x-real-ip') ?? request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ?? 'unknown';
  if (!allowed(caller)) return Response.json({ results: [] }, { status: 429, headers: { 'Retry-After': '60' } });
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
    // The same text gives the same places: the browser may keep them for an hour.
    return Response.json({ results }, { headers: { 'Cache-Control': 'private, max-age=3600' } });
  } catch {
    return Response.json({ results: [] }, { status: 502 });
  }
}
