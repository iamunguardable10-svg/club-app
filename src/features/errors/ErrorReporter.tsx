'use client';

/**
 * Catches what no page handles (piece 13): uncaught errors, rejected
 * promises, and changes the server refused. Rendered once, in the layout.
 */

import { useEffect, useRef } from 'react';

import { useBackendStatus } from '@/shared/data';

import { reportError } from './errorReporting';

export function ErrorReporter() {
  const status = useBackendStatus();
  const lastRejected = useRef<string | null>(null);

  useEffect(() => {
    const onError = (event: ErrorEvent) => {
      // "Script error." without an error object: the browser hid what happened
      // (another origin, an extension). Nothing anyone could act on.
      if (!event.error && /^Script error\.?$/.test(event.message ?? '')) return;
      reportError('error', event.error ?? event.message);
    };
    const onRejection = (event: PromiseRejectionEvent) => reportError('error', event.reason);
    window.addEventListener('error', onError);
    window.addEventListener('unhandledrejection', onRejection);
    return () => {
      window.removeEventListener('error', onError);
      window.removeEventListener('unhandledrejection', onRejection);
    };
  }, []);

  useEffect(() => {
    if (status.mode !== 'remote') return;
    if (status.rejected && status.rejected !== lastRejected.current) reportError('rejected', status.rejected);
    lastRejected.current = status.rejected;
  }, [status.mode, status.rejected]);

  return null;
}
