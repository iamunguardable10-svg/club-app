'use client';

import { useEffect, useRef } from 'react';
import { isTopSheet, openSheet } from '@/shared/overlay/sheetStack';
import { useBodyScrollLock } from './useBodyScrollLock';

/** The browser's own "close what is open" signal: Escape, and "back" on Android. */
type Watcher = { onclose: (() => void) | null; destroy(): void };
type WatcherClass = new () => Watcher;

/**
 * What every sheet and dialog calls with its "close". The one on top closes
 * (not everything at once) on Escape, on the phone's "back" where the browser
 * offers it (`CloseWatcher`: no history entries, so nothing interferes with
 * moving between pages), and on a swipe down (`OverlayRuntime`).
 */
export function useEscape(onEscape: () => void, active = true) {
  // What is open over the page holds the page still behind it (Ben, 2026-11-17: the RPE prompt scrolled the page).
  useBodyScrollLock(active);
  const handler = useRef(onEscape);
  handler.current = onEscape;
  useEffect(() => {
    if (!active) return;
    const entry = { close: () => handler.current() };
    const release = openSheet(entry);
    let alive = true;
    let watcher: Watcher | null = null;
    const watch = () => {
      const Class = (window as unknown as { CloseWatcher?: WatcherClass }).CloseWatcher;
      if (!Class) return;
      try {
        watcher = new Class();
        watcher.onclose = () => {
          watcher = null;
          entry.close();
          // A sheet that stays open (unsaved text) keeps listening.
          window.setTimeout(() => { if (alive) watch(); }, 0);
        };
      } catch {
        watcher = null; // The browser allows no further watcher right now: Escape below still works.
      }
    };
    watch();
    const onKey = (event: KeyboardEvent) => {
      if (event.key !== 'Escape' || event.defaultPrevented || watcher || !isTopSheet(entry)) return;
      event.preventDefault();
      entry.close();
    };
    window.addEventListener('keydown', onKey);
    return () => {
      alive = false;
      window.removeEventListener('keydown', onKey);
      watcher?.destroy();
      release();
    };
  }, [active]);
}
