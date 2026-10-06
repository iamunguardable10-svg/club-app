'use client';

import { useEffect, useRef } from 'react';
import { isPracticeActive, subscribe } from '@/shared/data';

/** Clear drafts and open sheets when the isolated document is discarded. */
export function usePracticeReset(reset: () => void) {
  const latest = useRef(reset);
  latest.current = reset;
  useEffect(() => {
    let wasPractising = isPracticeActive();
    return subscribe(() => {
      const active = isPracticeActive();
      if (wasPractising && !active) latest.current();
      wasPractising = active;
    });
  }, []);
}
