// Signs in the app on the home screen with the one-time code it was
// installed with (see migration 0025). POST { code } → { token_hash }, which
// the app turns into its own sign-in (auth.verifyOtp). The code is used up
// in the database first; the token works once and no email is sent.
// JWT verification is off: the app is not signed in yet, the code is the key.

import { createClient } from 'npm:@supabase/supabase-js@2';

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

Deno.serve(async (request) => {
  if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers: CORS });
  if (request.method !== 'POST') return json({ error: 'POST only' }, 405);
  const { code } = await request.json().catch(() => ({ code: null }));
  if (typeof code !== 'string' || !/^[0-9a-f]{64}$/.test(code)) return json({ error: 'Unknown code.' }, 404);

  const { data: email, error } = await admin.rpc('consume_login_handoff', { p_code: code });
  if (error) return json({ error: 'Could not check the code.' }, 500);
  if (!email) return json({ error: 'This sign-in link has expired. Please sign in once.' }, 404);

  const { data, error: linkError } = await admin.auth.admin.generateLink({ type: 'magiclink', email });
  if (linkError || !data?.properties?.hashed_token) return json({ error: 'Could not sign you in.' }, 500);
  return json({ token_hash: data.properties.hashed_token });
});
