/**
 * What a tip can wait for: the app says "this just happened" (e.g. the coach
 * put a new session into the calendar), and a tip with that `until` moves on.
 */

export type TipEvent = 'calendar.edit' | 'calendar.draft' | 'calendar.move' | 'calendar.resize' | 'calendar.open';

const NAME = 'club-tip';

export function tipEvent(event: TipEvent) {
  if (typeof window !== 'undefined') window.dispatchEvent(new CustomEvent<TipEvent>(NAME, { detail: event }));
}

export function onTipEvent(listener: (event: TipEvent) => void) {
  const handler = (event: Event) => listener((event as CustomEvent<TipEvent>).detail);
  window.addEventListener(NAME, handler);
  return () => window.removeEventListener(NAME, handler);
}
