/**
 * Carrying the way in over to the app on the home screen (2026-09-25,
 * extended 2026-11-17 for the install-first entry).
 *
 * The installed app gets its own, empty storage (on iPhones always), so
 * nothing from the browser comes along by itself. What the person was doing
 * goes into the address the new app starts with, in the page address and in
 * the manifest's start address, whichever the phone takes:
 * - `next`: the way in they opened (team code, invitation, founding code),
 *   so the app continues right there;
 * - `lang`: the language they picked;
 * - `handoff`: signed in in the browser, a one-time code (10 minutes, used
 *   once) that the app trades for its own sign-in (`finishLoginHandoff`);
 * - `src=app`: this start came from the home screen (`finishLaunch`).
 *
 * Store apps later: `STORE_LINKS` in installPrompt.ts; the steps then point
 * to the store and this stays for the web app.
 */

import { completeLoginHandoff, createLoginHandoff, getBackendChoice, hasJoinedOnThisDevice, hasSignedInAccount, setBackendChoice } from '@/shared/data';
import { currentLocale, isLocale, setLocale } from '@/shared/i18n';

import { isStandalone } from './installPrompt';

const PARAM = 'handoff';
let prepared: { code: string; at: number } | null = null;
let resume: string | null = null;

/** The ways in an installed app may start at; anything else starts at /start. */
const RESUMABLE = /^\/(join|found)(\?[A-Za-z0-9=&%._-]*)?$/;

export function isResumablePath(path: string): boolean {
  return RESUMABLE.test(path);
}

/** The current page without the parameters this file adds. */
function currentPath(): string {
  const url = new URL(window.location.href);
  for (const key of [PARAM, 'lang', 'src']) url.searchParams.delete(key);
  return `${url.pathname}${url.search}`;
}

function manifestHref() {
  const params = new URLSearchParams();
  if (resume) params.set('next', resume);
  if (prepared) params.set(PARAM, prepared.code);
  params.set('lang', currentLocale());
  return `/install.webmanifest?${params.toString()}`;
}

/** Puts the current state into the page address and the manifest link. */
function apply() {
  const url = new URL(window.location.href);
  if (prepared) url.searchParams.set(PARAM, prepared.code);
  url.searchParams.set('lang', currentLocale());
  url.searchParams.set('src', 'app');
  window.history.replaceState(window.history.state, '', url);
  const link = document.querySelector<HTMLLinkElement>('link[rel="manifest"]');
  if (link) link.href = manifestHref();
}

/**
 * While install steps are shown: the app on the home screen starts on this
 * page (a way in) or on the start page, in this language.
 */
export function prepareInstallResume(): void {
  if (typeof window === 'undefined' || isStandalone()) return;
  const path = currentPath();
  resume = isResumablePath(path) ? path : null;
  apply();
}

/** Signed in in the browser: make sure the next home-screen app starts with a fresh code. */
export async function prepareLoginHandoff(): Promise<void> {
  if (typeof window === 'undefined' || isStandalone() || getBackendChoice() !== 'server') return;
  if (prepared && Date.now() - prepared.at < 10 * 60_000) return;
  if (!(await hasSignedInAccount())) return;
  const code = await createLoginHandoff();
  prepared = { code, at: Date.now() };
  prepareInstallResume();
}

/**
 * On every signed-in page in Safari on an iPhone (field test 2026-11-20: a
 * person added the app later, from another page, and had to sign in again):
 * a fresh code in the manifest only, never in the address bar, so a copied
 * link does not carry it. Renewed before the 10 minutes run out.
 */
export async function keepHandoffReady(): Promise<void> {
  if (typeof window === 'undefined' || isStandalone() || getBackendChoice() !== 'server') return;
  if (!prepared || Date.now() - prepared.at > 8 * 60_000) {
    if (!(await hasSignedInAccount())) return;
    prepared = { code: await createLoginHandoff(), at: Date.now() };
  }
  // Signed in and inside the app: start on the start page, not at an old way in.
  const path = currentPath();
  resume = isResumablePath(path) ? path : null;
  const link = document.querySelector<HTMLLinkElement>('link[rel="manifest"]');
  if (link) link.href = manifestHref();
}

/** Whether this start carries a code to trade (installed app only). */
export function hasLoginHandoff(): boolean {
  return typeof window !== 'undefined' && isStandalone() && new URL(window.location.href).searchParams.has(PARAM);
}

/**
 * Every start: takes over the language from the address, and in the
 * installed app leaves a way in that is already done (a later start from the
 * home screen goes to the start page, not to "Join" again). Returns where to
 * go instead, or null to stay.
 */
export function finishLaunch(): string | null {
  if (typeof window === 'undefined') return null;
  const url = new URL(window.location.href);
  const lang = url.searchParams.get('lang');
  const fromHome = url.searchParams.get('src') === 'app';
  if (!lang && !fromHome) return null;
  url.searchParams.delete('lang');
  url.searchParams.delete('src');
  window.history.replaceState(window.history.state, '', url);
  if (lang && isLocale(lang) && isStandalone()) setLocale(lang);
  if (fromHome && isStandalone() && hasJoinedOnThisDevice() && isResumablePath(`${url.pathname}${url.search}`)) return '/start';
  return null;
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
