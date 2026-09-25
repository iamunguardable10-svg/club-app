'use client';

/**
 * Says so when the server did not accept a change, and when the app is
 * offline (piece 18). Only in server mode; the local test mode keeps
 * everything on the device anyway.
 *
 * The app shows a change at once and sends it afterwards. When row-level
 * security or a database rule refuses it, the store reloads the server state,
 * so the screen quietly jumps back — this banner explains why. Offline, the
 * screen shows what the device kept and changes wait until the network is
 * back — the small pill says since when and how many.
 */

import { dismissRejectedChange, useBackendStatus } from '@/shared/data';
import { formatShortDate, formatTime, plural } from '@/shared/format';

function since(savedAt: string) {
  const saved = new Date(savedAt);
  const today = new Date().toDateString() === saved.toDateString();
  return today ? formatTime(saved) : `${formatShortDate(saved)} ${formatTime(saved)}`;
}

export function SyncStatusBanner() {
  const status = useBackendStatus();
  if (status.mode !== 'remote') return null;
  const offline = status.offline && status.phase === 'ready';
  if (!status.rejected && !offline) return null;
  return (
    <div className="pointer-events-none fixed inset-x-3 bottom-24 z-[130] mx-auto grid max-w-md justify-items-center gap-2 sm:bottom-6">
      {offline ? (
        <p role="status" className="pointer-events-auto rounded-full border border-amber-300/50 bg-amber-950/95 px-3 py-1.5 text-xs font-black text-amber-100 shadow-2xl">
          Offline
          {status.savedAt ? ` · as of ${since(status.savedAt)}` : ''}
          {status.pending > 0 ? ` · ${plural(status.pending, 'change')} waiting to send` : ''}
        </p>
      ) : null}
      {status.rejected ? (
        <div role="alert" className="pointer-events-auto w-full rounded-2xl border border-red-500/50 bg-red-950/95 p-3 text-sm font-bold text-red-100 shadow-2xl">
          <div className="flex items-start justify-between gap-3">
            <p>{status.rejected}</p>
            <button type="button" onClick={dismissRejectedChange} className="shrink-0 rounded-full border border-red-300/40 px-2 py-1 text-xs font-black">OK</button>
          </div>
        </div>
      ) : null}
    </div>
  );
}
