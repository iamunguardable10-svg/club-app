// Apple Calendar connection (piece 20), optional for everyone.
//
//   POST { action: 'connect', appleId, password }   signed-in person (Authorization: Bearer <their token>)
//   POST { action: 'sync' }                          signed-in person, "Sync now"
//   POST { action: 'tick' }                          every 15 minutes, x-dispatch-secret
//
// The password is checked against iCloud before it is stored (Vault, via
// apple_sync_connect); it is never sent back. Each account gets 5
// connection attempts and 60 syncs per hour (apple_calendar_allow), so the
// function cannot be used to try out Apple passwords. JWT verification is
// off at the gateway because the 15-minute call has no user; user calls are
// checked here with auth.getUser.

import { createClient } from 'npm:@supabase/supabase-js@2';

import { DavError } from './caldav.ts';
import { connect, sync } from './sync.ts';

const ICLOUD = 'https://caldav.icloud.com/';
const admin = createClient(Deno.env.get('SUPABASE_URL') ?? '', Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '', {
  auth: { persistSession: false, autoRefreshToken: false },
});

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'content-type, apikey, authorization, x-client-info',
};

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { ...CORS, 'Content-Type': 'application/json' } });
}

type Loaded = {
  apple_id: string;
  password: string;
  home_url: string;
  club_os_url: string | null;
  events: Parameters<typeof sync>[0]['events'];
  pushed: Record<string, string>;
  imports: string[];
};

async function syncUser(userId: string) {
  const { data, error } = await admin.rpc('apple_sync_load', { p_user: userId });
  if (error || !data) return { error: error?.message ?? 'Not connected.' };
  const loaded = data as Loaded;
  const result = await sync({
    account: { baseUrl: ICLOUD, username: loaded.apple_id, password: loaded.password },
    homeUrl: loaded.home_url,
    clubOsUrl: loaded.club_os_url,
    events: loaded.events,
    pushed: loaded.pushed,
    imports: loaded.imports,
  });
  await admin.rpc('apple_sync_save', { p_user: userId, p_result: result });
  return 'error' in result ? { error: result.error } : { written: result.written, deleted: result.deleted, calendars: result.calendars.length };
}

async function allowed(userId: string, kind: 'connect' | 'sync') {
  const { data, error } = await admin.rpc('apple_calendar_allow', { p_user: userId, p_kind: kind });
  return !error && data === true;
}

async function signedInUser(request: Request): Promise<string | null> {
  const token = (request.headers.get('authorization') ?? '').replace(/^Bearer\s+/i, '');
  if (!token) return null;
  const { data } = await admin.auth.getUser(token);
  return data.user?.id ?? null;
}

Deno.serve(async (request) => {
  if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers: CORS });
  if (request.method !== 'POST') return json({ error: 'POST only' }, 405);
  const body = await request.json().catch(() => ({})) as { action?: string; appleId?: string; password?: string };

  if (body.action === 'tick') {
    const { data, error } = await admin.rpc('apple_sync_due', { p_secret: request.headers.get('x-dispatch-secret') ?? '' });
    if (error) return json({ error: 'Not allowed.' }, 401);
    const started = Date.now();
    let done = 0;
    for (const userId of (data ?? []) as string[]) {
      if (Date.now() - started > 100_000) break; // the rest next time
      await syncUser(userId);
      done += 1;
    }
    return json({ synced: done });
  }

  const userId = await signedInUser(request);
  if (!userId) return json({ error: 'Please sign in again.' }, 401);

  if (body.action === 'connect') {
    if (!(await allowed(userId, 'connect'))) {
      return json({ error: 'Too many tries. Wait an hour, then check the Apple ID and make a new app-specific password.' }, 429);
    }
    const appleId = (body.appleId ?? '').trim();
    const password = (body.password ?? '').replace(/\s+/g, '');
    if (!appleId || !password) return json({ error: 'Enter your Apple ID and the app-specific password.' }, 400);
    try {
      const { homeUrl, clubOsUrl } = await connect({ baseUrl: ICLOUD, username: appleId, password });
      const { error } = await admin.rpc('apple_sync_connect', {
        p_user: userId, p_apple_id: appleId, p_password: password, p_home_url: homeUrl, p_club_os_url: clubOsUrl,
      });
      if (error) return json({ error: 'Could not save the connection.' }, 500);
    } catch (error) {
      const message = error instanceof DavError ? error.message : 'Could not reach Apple Calendar. Try again in a moment.';
      return json({ error: message }, error instanceof DavError && error.status === 401 ? 400 : 502);
    }
    return json(await syncUser(userId));
  }

  if (body.action === 'sync') {
    if (!(await allowed(userId, 'sync'))) return json({ error: 'Synced a lot just now. Try again in a few minutes.' }, 429);
    return json(await syncUser(userId));
  }
  return json({ error: 'Unknown action.' }, 400);
});
