'use client';

import { useEffect, useState } from 'react';

import { currentAccount, getBackendChoice, setBackendChoice } from '@/shared/data';

export type Account = { email: string } | null | undefined;

/**
 * The signed-in account on the onboarding pages (undefined while checking).
 * Signed in but this device is in the local test mode: joining and founding
 * only exist on the server, so switch and load the page fresh.
 */
export function useAccount(): Account {
  const [account, setAccount] = useState<Account>(undefined);
  useEffect(() => {
    currentAccount()
      .then((found) => {
        if (found && getBackendChoice() !== 'server') {
          setBackendChoice('server');
          window.location.reload();
          return;
        }
        setAccount(found);
      })
      .catch(() => setAccount(null));
  }, []);
  return account;
}
