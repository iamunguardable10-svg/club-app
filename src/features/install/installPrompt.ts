'use client';

/**
 * Chrome, Edge and Samsung Internet on Android offer their own install
 * dialog through `beforeinstallprompt`. The event fires once, early, so it is
 * caught here as soon as the app starts and kept for the install button.
 */

type InstallPromptEvent = Event & { prompt: () => Promise<void>; userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }> };

let deferred: InstallPromptEvent | null = null;
let installed = false;
const listeners = new Set<() => void>();
let listening = false;

function notify() {
  for (const listener of listeners) listener();
}

export function listenForInstallPrompt(): void {
  if (listening || typeof window === 'undefined') return;
  listening = true;
  window.addEventListener('beforeinstallprompt', (event) => {
    // Keep the browser's own mini bar away; the app offers the button itself.
    event.preventDefault();
    deferred = event as InstallPromptEvent;
    notify();
  });
  window.addEventListener('appinstalled', () => {
    installed = true;
    deferred = null;
    notify();
  });
}

export function subscribeInstallPrompt(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function canPromptInstall(): boolean {
  return deferred !== null;
}

export function wasInstalled(): boolean {
  return installed;
}

/** Opens the browser's install dialog; true if the person installed. */
export async function promptInstall(): Promise<boolean> {
  if (!deferred) return false;
  const event = deferred;
  deferred = null;
  await event.prompt();
  const choice = await event.userChoice;
  notify();
  return choice.outcome === 'accepted';
}

/** Already running as an installed app (home screen icon). */
export function isStandalone(): boolean {
  if (typeof window === 'undefined') return false;
  return window.matchMedia('(display-mode: standalone)').matches || (navigator as Navigator & { standalone?: boolean }).standalone === true;
}

export type InstallPlatform = 'ios' | 'android' | 'desktop';

export function installPlatform(): InstallPlatform {
  if (typeof navigator === 'undefined') return 'desktop';
  const ua = navigator.userAgent;
  // iPadOS reports itself as a Mac; touch points give it away.
  if (/iPhone|iPad|iPod/.test(ua) || (/Macintosh/.test(ua) && navigator.maxTouchPoints > 1)) return 'ios';
  if (/Android/.test(ua)) return 'android';
  return 'desktop';
}

/** iPhone, iPad or Mac: where Apple Calendar is the calendar (piece 20). */
export function isAppleDevice(): boolean {
  return installPlatform() === 'ios' || (typeof navigator !== 'undefined' && /Macintosh/.test(navigator.userAgent));
}
