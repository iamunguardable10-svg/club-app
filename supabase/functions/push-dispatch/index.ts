// Sends due Club OS push notifications (piece 7).
//
// Called every minute by app.push_tick() (pg_cron + pg_net) with the
// dispatch secret in `x-dispatch-secret`. The database checks the secret,
// hands out the due messages with the VAPID keys (push_take_due) and takes
// the results back (push_report), removing devices that are gone. Nothing
// is stored here; JWT verification is off because the secret is the guard.

import webpush from 'npm:web-push@3.6.7';

type Item = {
  outbox_id: string;
  endpoint: string;
  p256dh: string;
  auth: string;
  payload: { title: string; body: string; url: string; tag: string };
};
type Batch = { vapid: { public_key: string | null; private_key: string | null; subject: string | null }; items: Item[] };

const SUPABASE_URL = Deno.env.get('SUPABASE_URL') ?? '';
const KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? Deno.env.get('SUPABASE_ANON_KEY') ?? '';

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });
}

async function rpc<T>(name: string, args: Record<string, unknown>): Promise<{ ok: true; data: T } | { ok: false; status: number; error: string }> {
  const headers: Record<string, string> = { apikey: KEY, 'Content-Type': 'application/json' };
  // Legacy keys are JWTs and go in Authorization too; the newer keys only in `apikey`.
  if (KEY.startsWith('eyJ')) headers.Authorization = `Bearer ${KEY}`;
  const response = await fetch(`${SUPABASE_URL}/rest/v1/rpc/${name}`, { method: 'POST', headers, body: JSON.stringify(args) });
  if (!response.ok) return { ok: false, status: response.status, error: await response.text() };
  const text = await response.text();
  return { ok: true, data: (text ? JSON.parse(text) : null) as T };
}

Deno.serve(async (request) => {
  if (request.method !== 'POST') return json({ error: 'POST only' }, 405);
  const secret = request.headers.get('x-dispatch-secret') ?? '';

  const batch = await rpc<Batch>('push_take_due', { p_secret: secret });
  if (!batch.ok) {
    const denied = batch.status === 401 || batch.status === 403;
    return json({ error: denied ? 'Not allowed.' : batch.error }, denied ? 401 : 500);
  }
  const { vapid, items } = batch.data;
  if (items.length === 0) return json({ sent: 0, failed: 0 });
  if (!vapid.public_key || !vapid.private_key || !vapid.subject) return json({ error: 'VAPID keys are not set up.' }, 500);
  webpush.setVapidDetails(vapid.subject, vapid.public_key, vapid.private_key);

  const results = await Promise.all(items.map(async (item) => {
    try {
      const response = await webpush.sendNotification(
        { endpoint: item.endpoint, keys: { p256dh: item.p256dh, auth: item.auth } },
        JSON.stringify(item.payload),
        // Kept up to 12 hours if the phone is offline; after that it is stale.
        { TTL: 12 * 3600, urgency: 'normal' },
      );
      return { outbox_id: item.outbox_id, endpoint: item.endpoint, status: response.statusCode };
    } catch (error) {
      const status = (error as { statusCode?: number }).statusCode ?? 0;
      return { outbox_id: item.outbox_id, endpoint: item.endpoint, status };
    }
  }));

  const report = await rpc<null>('push_report', { p_secret: secret, p_results: results });
  if (!report.ok) return json({ error: report.error }, 500);
  const sent = results.filter((result) => result.status >= 200 && result.status < 300).length;
  return json({ sent, failed: results.length - sent });
});
