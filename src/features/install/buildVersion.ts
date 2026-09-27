/**
 * An app left open (or kept offline) across a deploy still runs the old
 * build; its first page change then loads parts of the new one, which do not
 * fit ("undefined is not an object (evaluating 'e[o].call')", ChunkLoadError).
 * The fix is a fresh load of the page, once: when the app comes back to the
 * front and the server runs a newer build, and when such an error happens.
 */

export const APP_VERSION = process.env.NEXT_PUBLIC_APP_VERSION ?? 'local';

const RELOADED_KEY = 'club-os.reloaded-for-build';

/** Errors from parts of two builds meeting, not from the app itself. */
export function isStaleBuildError(error: unknown): boolean {
  const text = error instanceof Error ? `${error.name}: ${error.message}` : String(error ?? '');
  return /ChunkLoadError|Loading (?:CSS )?chunk [\w-]+ failed|evaluating '[\w$]+\[[\w$]+\]\.call'|reading 'call'\)|Failed to fetch dynamically imported module/.test(text);
}

/** A second fresh load for the same build only after this long. */
const RELOAD_GAP_MS = 5 * 60_000;

/**
 * Whether to load the page again, given the last time this tab did so for
 * the same build (`<build>@<ms>`): at most once in five minutes, so an error
 * that is not about the build, or a page that came from the offline copy
 * again, cannot loop.
 */
export function mayReload(last: string | null, now: number, version = APP_VERSION): boolean {
  if (!last) return true;
  const [build, at] = last.split('@');
  return build !== version || !(now - Number(at) < RELOAD_GAP_MS);
}

/** Loads the page again if `mayReload` allows it. True when it reloads. */
export function reloadOnce(): boolean {
  if (typeof window === 'undefined') return false;
  try {
    if (!mayReload(window.sessionStorage.getItem(RELOADED_KEY), Date.now())) return false;
    window.sessionStorage.setItem(RELOADED_KEY, `${APP_VERSION}@${Date.now()}`);
  } catch {
    return false;
  }
  window.location.reload();
  return true;
}

/** The build the server runs now; null offline or on any problem. */
export async function serverVersion(): Promise<string | null> {
  try {
    const response = await fetch('/api/version', { cache: 'no-store' });
    if (!response.ok) return null;
    const body = (await response.json()) as { version?: unknown };
    return typeof body.version === 'string' ? body.version : null;
  } catch {
    return null;
  }
}
