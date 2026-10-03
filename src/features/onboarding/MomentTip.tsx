'use client';

/**
 * Placed inside a feature (the "How hard was it?" question, the squad, the
 * weekly plan …): the first time it appears, its short tour plays once.
 */

import { useEffect } from 'react';

import { requestTour } from './tourBus';
import type { MomentTipId } from './tours';

export function MomentTip({ id }: { id: MomentTipId }) {
  useEffect(() => {
    // A beat after it appears, so it has settled (sheets slide in).
    const timer = window.setTimeout(() => requestTour(id), 650);
    return () => window.clearTimeout(timer);
  }, [id]);
  return null;
}
