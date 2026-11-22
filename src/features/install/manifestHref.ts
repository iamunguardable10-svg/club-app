/**
 * The manifest link a page is served with (field test 2026-11-22): an iPhone
 * takes the start address of the home-screen app from the manifest it loaded
 * with the page, not from one swapped in later. So a way in (team link,
 * invitation, founding code) is put into the manifest on the server already,
 * and a sign-in code (`handoff`) once the page was loaded with it in its
 * address (installHandoff.ts loads the page once more for that).
 *
 * Server and client: no browser APIs.
 */

type Params = Record<string, string | string[] | undefined>;

const HANDOFF = /^[0-9a-f]{64}$/;
const LANG = /^[a-z]{2}$/;
const OWN = new Set(['handoff', 'lang', 'src']);

function first(value: string | string[] | undefined): string | undefined {
  return Array.isArray(value) ? value[0] : value;
}

/** `/install.webmanifest?…` for the page at `path` with these address parameters. */
export function manifestHrefFor(path: string, params: Params, resumable: boolean): string {
  const query = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    const single = first(value);
    if (single !== undefined && !OWN.has(key)) query.set(key, single);
  }
  const out = new URLSearchParams();
  if (resumable) out.set('next', query.size ? `${path}?${query.toString()}` : path);
  const handoff = first(params.handoff);
  if (handoff && HANDOFF.test(handoff)) out.set('handoff', handoff);
  const lang = first(params.lang);
  if (lang && LANG.test(lang)) out.set('lang', lang);
  return `/install.webmanifest${out.size ? `?${out.toString()}` : ''}`;
}
