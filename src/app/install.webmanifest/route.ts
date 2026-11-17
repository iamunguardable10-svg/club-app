import manifest from '../manifest';

/**
 * The manifest while install steps are shown (see installHandoff.ts): the
 * same as /manifest.webmanifest, but the app starts where the person was —
 * their way in (`next`, only /join and /found), their language (`lang`), and
 * signed in (`handoff`, a one-time code).
 */
const RESUMABLE = /^\/(join|found)(\?[A-Za-z0-9=&%._-]*)?$/;

export function GET(request: Request) {
  const params = new URL(request.url).searchParams;
  const next = params.get('next') ?? '';
  const code = params.get('handoff') ?? '';
  const lang = params.get('lang') ?? '';
  const resumable = RESUMABLE.test(next);
  const start = new URL(resumable ? next : '/start', 'https://app.invalid');
  if (/^[0-9a-f]{64}$/.test(code)) start.searchParams.set('handoff', code);
  if (/^[a-z]{2}$/.test(lang)) start.searchParams.set('lang', lang);
  // Only a way in needs to know it was started from the home screen (finishLaunch).
  if (resumable) start.searchParams.set('src', 'app');
  return new Response(JSON.stringify({ ...manifest(), start_url: `${start.pathname}${start.search}` }), {
    headers: { 'Content-Type': 'application/manifest+json', 'Cache-Control': 'no-store' },
  });
}
