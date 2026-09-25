// Answers calendar apps subscribed to a Club OS calendar link (piece 19):
//   GET /functions/v1/calendar-feed/<token>.ics   (or ?token=<token>)
// The secret link is the only key, so JWT verification is off. The events
// come from public.calendar_feed (server key only); an unknown or replaced
// link gets 404. Nothing is stored here.

import { toIcs, type Feed } from './ics.ts';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL') ?? '';
const KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';

function headers(): Record<string, string> {
  const result: Record<string, string> = { apikey: KEY, 'Content-Type': 'application/json' };
  // Legacy keys are JWTs and go in Authorization too; the newer keys only in `apikey`.
  if (KEY.startsWith('eyJ')) result.Authorization = `Bearer ${KEY}`;
  return result;
}

async function rpc(name: string, args: Record<string, unknown>): Promise<Response> {
  return fetch(`${SUPABASE_URL}/rest/v1/rpc/${name}`, { method: 'POST', headers: headers(), body: JSON.stringify(args) });
}

function text(body: string, status: number) {
  return new Response(body, { status, headers: { 'Content-Type': 'text/plain; charset=utf-8' } });
}

Deno.serve(async (request) => {
  if (request.method !== 'GET' && request.method !== 'HEAD') return text('GET only', 405);
  const url = new URL(request.url);
  const last = url.pathname.split('/').pop() ?? '';
  const token = (url.searchParams.get('token') ?? last).replace(/\.ics$/, '');
  if (!/^[0-9a-f]{48,128}$/.test(token)) return text('Unknown calendar link.', 404);

  const response = await rpc('calendar_feed', { p_token: token });
  if (!response.ok) {
    const detail = await response.text();
    await rpc('report_error', { p_kind: 'server', p_message: `calendar-feed: ${response.status} ${detail}`.slice(0, 500), p_page: 'calendar-feed' }).catch(() => undefined);
    return text('The calendar is not available right now.', 502);
  }
  const feed = (await response.json()) as Feed | null;
  if (!feed) return text('This calendar link no longer works. Get a new one in Club OS under Settings.', 404);

  return new Response(request.method === 'HEAD' ? null : toIcs(feed), {
    headers: {
      'Content-Type': 'text/calendar; charset=utf-8',
      'Content-Disposition': 'inline; filename="club-os.ics"',
      'Cache-Control': 'private, max-age=900',
    },
  });
});
