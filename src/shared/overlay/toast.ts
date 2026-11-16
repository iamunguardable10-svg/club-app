/**
 * One short line at the foot of the screen, optionally with one action
 * ("Undo"). Anything may show one; `OverlayRuntime` draws it.
 */

export type Toast = { id: number; text: string; action?: { label: string; run: () => void }; tone?: 'plain' | 'error' };

type Listener = (toast: Toast | null) => void;
const listeners = new Set<Listener>();
let counter = 0;

export function showToast(text: string, action?: Toast['action'], tone: Toast['tone'] = 'plain'): void {
  counter += 1;
  const toast = { id: counter, text, action, tone };
  for (const listener of listeners) listener(toast);
}

export function hideToast(): void {
  for (const listener of listeners) listener(null);
}

export function onToast(listener: Listener): () => void {
  listeners.add(listener);
  return () => { listeners.delete(listener); };
}
