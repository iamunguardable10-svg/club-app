/**
 * Asking for a tour from anywhere: a page's "?" (replay) or a moment tip
 * when its feature first appears. The `TourHost` of the page shows it.
 */

import type { TourId } from './tours';

export type TourRequest = { id: TourId; replay: boolean };

const listeners = new Set<(request: TourRequest) => void>();

export function requestTour(id: TourId, replay = false): void {
  for (const listener of listeners) listener({ id, replay });
}

export function onTourRequest(listener: (request: TourRequest) => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}
