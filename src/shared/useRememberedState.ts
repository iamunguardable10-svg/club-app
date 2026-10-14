'use client';

/**
 * State that survives leaving a screen and coming back to it in this page
 * session (switching tabs, going back): a chosen filter or range is still
 * there. Kept in memory only, per person, so it never outlives the page,
 * never reaches another account on the device and is gone after signing out
 * (which reloads the page).
 */

import { useCallback, useState } from 'react';

const remembered = new Map<string, unknown>();

export function useRememberedState<T>(key: string, scope: string | null | undefined, initial: T): [T, (next: T) => void] {
  const slot = scope ? `${scope}:${key}` : null;
  const [value, setValue] = useState<T>(() => (slot && remembered.has(slot) ? (remembered.get(slot) as T) : initial));
  const update = useCallback((next: T) => {
    if (slot) remembered.set(slot, next);
    setValue(next);
  }, [slot]);
  return [value, update];
}
