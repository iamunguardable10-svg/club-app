/**
 * Staying signed in when the app is added to the home screen (2026-09-25).
 *
 * On iPhones the home-screen app gets its own, empty storage, so the Safari
 * sign-in does not come along. While the install steps are shown on a
 * signed-in page, this asks the server for a one-time code (10 minutes, used
 * once) and puts it in the address the new app starts with: in the page
 * address and in the manifest's start address, whichever iOS takes. The
 * installed app trades it once for its own sign-in (`useLoginHandoff`).
 */

import { completeLoginHandoff, createLoginHandoff, getBackendChoice, hasSignedInAccount, setBackendChoice } from '@/shared/data';

import { isStandalone } from './installPrompt';

const PARAM = 'handoff';
let prepared: { code: string; at: number } | null = null;

function withCode(url: URL, code: string) {
  url.searchParams.set(PARAM, code);
  return url;
}

/** Signed in in the browser: make sure the next home-screen app starts with a fresh code. */
export async function prepareLoginHandoff(): Promise<void> {
  if (typeof window === 'undefined' || isStandalone() || getBackendChoice() !== 'server') return;
  if (prepared && Date.now() - prepared.at < 10 * 60_000) return;
  if (!(await hasSignedInAccount())) return;
  const code = await createLoginHandoff();
  prepared = { code, at: Date.now() };
  window.history.replaceState(window.history.state, '', withCode(new URL(window.location.href), code));
  const link = document.querySelector<HTMLLinkElement>('link[rel="manifest"]');
  if (link) link.href = `/install.webmanifest?${PARAM}=${code}`;
}

/** Whether this start carries a code to trade (installed app only). */
export function hasLoginHandoff(): boolean {
  return typeof window !== 'undefined' && isStandalone() && new URL(window.location.href).searchParams.has(PARAM);
}

/**
 * In the installed app, first start: sign in with the code and use the club
 * server (the new storage does not know either yet), then clean the address.
 * 'expired': the code was used up or too old, the person signs in once.
 */
export async function finishLoginHandoff(): Promise<'signed-in' | 'expired' | 'none'> {
  if (!hasLoginHandoff()) return 'none';
  const url = new URL(window.location.href);
  const code = url.searchParams.get(PARAM)!;
  url.searchParams.delete(PARAM);
  window.history.replaceState(window.history.state, '', url);
  // The code comes from a signed-in page of the club server.
  setBackendChoice('server');
  if (await hasSignedInAccount()) return 'signed-in';
  return (await completeLoginHandoff(code).catch(() => false)) ? 'signed-in' : 'expired';
}
