'use client';

/**
 * Signing out deletes what this device keeps of the account (piece 18),
 * changes still waiting for the network included, so with any waiting the
 * button asks once more.
 */

import { useState } from 'react';

import { signOut, useBackendStatus } from '@/shared/data';
import { useT } from '@/shared/i18n';

export function SignOutButton({ className }: { className: string }) {
  const t = useT();
  const status = useBackendStatus();
  const [armed, setArmed] = useState(false);
  const [busy, setBusy] = useState(false);

  async function leave() {
    if (status.pending > 0 && !armed) {
      setArmed(true);
      return;
    }
    setBusy(true);
    try {
      await signOut();
    } finally {
      window.location.assign('/');
    }
  }

  return (
    <button type="button" disabled={busy} onClick={() => void leave()} className={className}>
      {armed ? t('auth.signOutAnyway', { count: status.pending }) : t('auth.signOut')}
    </button>
  );
}
