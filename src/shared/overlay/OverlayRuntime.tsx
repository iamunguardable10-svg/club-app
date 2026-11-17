'use client';

import { useEffect, useRef, useState } from 'react';
import { closeTopSheet, openSheetCount } from './sheetStack';
import { onToast, type Toast } from './toast';

const TOAST_MS = 6000;
/** How far (px) or how fast (px/ms) a sheet must be pulled down to close. */
const PULL_DISTANCE = 96;
const PULL_SPEED = 0.6;

/**
 * Behaviour shared by everything that opens over a page, mounted once:
 * - a sheet on a phone follows the finger and closes when pulled down,
 * - one toast line with an optional "Undo".
 * (Escape and the phone's "back" are handled per sheet in `useEscape`.)
 */
export function OverlayRuntime() {
  const [toast, setToast] = useState<Toast | null>(null);
  const timer = useRef<number | null>(null);

  useEffect(() => onToast((next) => {
    if (timer.current) window.clearTimeout(timer.current);
    setToast(next);
    if (next) timer.current = window.setTimeout(() => setToast(null), TOAST_MS);
  }), []);

  // Pull a sheet down to close it (phones; the sheet must be scrolled to its top).
  useEffect(() => {
    let sheet: HTMLElement | null = null;
    let startY = 0;
    let startX = 0;
    let startAt = 0;
    let dragging = false;
    let offset = 0;
    let frame = 0;
    let backdrop: HTMLElement | null = null;
    // One write per screen frame, on the compositor (transform and opacity only).
    const paint = () => {
      frame = 0;
      if (!sheet) return;
      sheet.style.transform = `translate3d(0, ${offset}px, 0)`;
      if (backdrop) backdrop.style.opacity = String(Math.max(0.35, 1 - offset / 600));
    };

    const scrolledInside = (from: Element, until: HTMLElement) => {
      for (let node: Element | null = from; node; node = node.parentElement) {
        if (node.scrollTop > 0) return true;
        if (node === until) return false;
      }
      return false;
    };

    const onStart = (event: TouchEvent) => {
      sheet = null;
      dragging = false;
      if (event.touches.length !== 1 || openSheetCount() === 0 || window.innerWidth >= 640) return;
      const target = event.target as Element | null;
      const found = target?.closest<HTMLElement>('.os-sheet');
      // Sliders, maps and things that are dragged themselves keep their gesture.
      if (!found || !target || target.closest('input[type="range"], textarea, [data-no-pull], [data-calendar-session], .leaflet-container') || scrolledInside(target, found)) return;
      sheet = found;
      startY = event.touches[0].clientY;
      startX = event.touches[0].clientX;
      startAt = event.timeStamp;
      offset = 0;
    };

    const onMove = (event: TouchEvent) => {
      if (!sheet) return;
      const dy = event.touches[0].clientY - startY;
      const dx = event.touches[0].clientX - startX;
      if (!dragging) {
        if (Math.abs(dy) < 8 && Math.abs(dx) < 8) return;
        if (dy <= 0 || Math.abs(dx) > Math.abs(dy)) { sheet = null; return; }
        dragging = true;
        sheet.style.transition = 'none';
        sheet.style.animation = 'none';
        sheet.style.willChange = 'transform';
        backdrop = sheet.parentElement && sheet.parentElement !== document.body ? sheet.parentElement : null;
        if (backdrop) { backdrop.style.transition = 'none'; backdrop.style.willChange = 'opacity'; }
      }
      // A little resistance at the start, so a small pull does not look like a jump.
      offset = Math.max(0, dy < 40 ? dy * 0.85 : dy - 6);
      if (!frame) frame = window.requestAnimationFrame(paint);
      if (event.cancelable) event.preventDefault();
    };

    const onEnd = (event: TouchEvent) => {
      const moved = sheet;
      sheet = null;
      if (frame) { window.cancelAnimationFrame(frame); frame = 0; }
      if (!moved || !dragging) return;
      dragging = false;
      const shade = backdrop;
      backdrop = null;
      const settle = () => { moved.style.willChange = ''; if (shade) { shade.style.willChange = ''; } };
      const speed = offset / Math.max(1, event.timeStamp - startAt);
      const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
      if (offset > PULL_DISTANCE || (offset > 24 && speed > PULL_SPEED)) {
        // It keeps going the way it was thrown, then closes.
        moved.style.transition = reduce ? 'none' : 'transform 0.2s cubic-bezier(0.4, 0, 1, 1)';
        moved.style.transform = 'translate3d(0, 110%, 0)';
        if (shade) { shade.style.transition = reduce ? 'none' : 'opacity 0.2s linear'; shade.style.opacity = '0'; }
        window.setTimeout(() => {
          if (!closeTopSheet()) return;
          // A sheet that asked to stay (unsaved text) comes back.
          window.setTimeout(() => {
            if (moved.isConnected) { moved.style.transition = 'transform 0.28s cubic-bezier(0.2, 0.8, 0.2, 1)'; moved.style.transform = ''; }
            if (shade?.isConnected) { shade.style.transition = 'opacity 0.2s linear'; shade.style.opacity = ''; }
            settle();
          }, 60);
        }, reduce ? 0 : 190);
      } else {
        moved.style.transition = reduce ? 'none' : 'transform 0.32s cubic-bezier(0.2, 0.9, 0.3, 1.15)';
        moved.style.transform = '';
        if (shade) { shade.style.transition = reduce ? 'none' : 'opacity 0.25s ease-out'; shade.style.opacity = ''; }
        window.setTimeout(settle, 340);
      }
    };

    document.addEventListener('touchstart', onStart, { passive: true });
    document.addEventListener('touchmove', onMove, { passive: false });
    document.addEventListener('touchend', onEnd);
    document.addEventListener('touchcancel', onEnd);
    return () => {
      document.removeEventListener('touchstart', onStart);
      document.removeEventListener('touchmove', onMove);
      document.removeEventListener('touchend', onEnd);
      document.removeEventListener('touchcancel', onEnd);
    };
  }, []);

  if (!toast) return null;
  return (
    <div className="pointer-events-none fixed inset-x-0 bottom-[calc(5.75rem+env(safe-area-inset-bottom))] z-[300] flex justify-center px-4 md:bottom-8">
      <div key={toast.id} role="status" className={`os-toast pointer-events-auto ${toast.tone === 'error' ? 'os-toast-error' : ''}`}>
        <span className="min-w-0">{toast.text}</span>
        {toast.action ? (
          <button type="button" className="os-toast-action" onClick={() => { toast.action!.run(); setToast(null); }}>{toast.action.label}</button>
        ) : null}
      </div>
    </div>
  );
}
