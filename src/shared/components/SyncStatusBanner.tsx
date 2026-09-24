'use client';

/**
 * Says so when the server did not accept a change. Only in server mode; the
 * local test mode has nothing to refuse.
 *
 * The app shows a change at once and sends it afterwards. When row-level
 * security or a database rule refuses it, the store reloads the server state,
 * so the screen quietly jumps back — this banner explains why.
 */

import { dismissRejectedChange, useBackendStatus } from '@/shared/data';

export function SyncStatusBanner() {
  const status = useBackendStatus();
  if (status.mode !== 'remote' || !status.rejected) return null;
  return (
    <div role="alert" className="fixed inset-x-3 bottom-24 z-[130] mx-auto max-w-md rounded-2xl border border-red-500/50 bg-red-950/95 p-3 text-sm font-bold text-red-100 shadow-2xl sm:bottom-6">
      <div className="flex items-start justify-between gap-3">
        <p>{status.rejected}</p>
        <button type="button" onClick={dismissRejectedChange} className="shrink-0 rounded-full border border-red-300/40 px-2 py-1 text-xs font-black">OK</button>
      </div>
    </div>
  );
}
