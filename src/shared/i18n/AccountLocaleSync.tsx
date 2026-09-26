'use client';

/**
 * Keeps the app language on the account while signed in to the club server
 * (push messages and mails in that language, docs/i18n.md 6b). Renders
 * nothing.
 */

import { useEffect } from 'react';

import { saveAccountLocale, useBackendStatus } from '@/shared/data';

import { useLocale } from './index';

export function AccountLocaleSync() {
  const locale = useLocale();
  const { mode, phase } = useBackendStatus();
  useEffect(() => {
    if (mode === 'remote' && phase === 'ready') void saveAccountLocale(locale);
  }, [locale, mode, phase]);
  return null;
}
