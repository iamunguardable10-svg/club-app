'use client';

import { setBackendChoice } from '@/shared/data';

/** Leaves the server for the local test mode on this device (and back to the start page). */
export function LocalModeLink({ className = '' }: { className?: string }) {
  return (
    <button
      type="button"
      onClick={() => {
        setBackendChoice('local');
        window.location.assign('/');
      }}
      className={`text-xs font-bold text-slate-400 underline ${className}`}
    >
      Ohne Anmeldung lokal testen
    </button>
  );
}
