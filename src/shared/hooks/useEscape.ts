'use client';

import { useEffect, useRef } from 'react';

/** Escape closes what is open over the page (DESIGN.md "Sheets"; audit 2026-11, 12). */
export function useEscape(onEscape: () => void, active = true) {
  const handler = useRef(onEscape);
  handler.current = onEscape;
  useEffect(() => {
    if (!active) return;
    const onKey = (event: KeyboardEvent) => { if (event.key === 'Escape') handler.current(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [active]);
}
