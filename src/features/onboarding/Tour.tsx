'use client';

/**
 * A guided tour over the real page, in the manner of iOS onboarding: the rest
 * of the screen dims, a light frames one control, a finger (on phones) or a
 * cursor (with a mouse) shows the gesture, and a card says in one sentence
 * what it does. Doing the gesture on the framed control moves on – tap, swipe,
 * drag or pull the edge – but nothing reaches the page underneath, so a tour
 * never changes data. "Next", "Back", "Skip" and the keyboard (→ ← Esc) work
 * too. Steps whose control is not on the page (another role, a team without
 * load tracking, a phone-only gesture on a desktop) are left out.
 */

import { useCallback, useEffect, useId, useLayoutEffect, useMemo, useRef, useState, type PointerEvent as ReactPointerEvent } from 'react';

import { useT, type MessageKey } from '@/shared/i18n';

import type { Gesture, TourStep } from './tours';

type Rect = { top: number; left: number; width: number; height: number };

const PAD = 8;
const MOVE_MS = 380;

function usePrefersReducedMotion() {
  const [reduced, setReduced] = useState(false);
  useEffect(() => {
    const query = window.matchMedia('(prefers-reduced-motion: reduce)');
    setReduced(query.matches);
    const change = () => setReduced(query.matches);
    query.addEventListener('change', change);
    return () => query.removeEventListener('change', change);
  }, []);
  return reduced;
}

function useFinePointer() {
  const [fine, setFine] = useState(false);
  useEffect(() => setFine(window.matchMedia('(pointer: fine)').matches), []);
  return fine;
}

/** The first visible element marked `data-tour="<id>"` (phone and desktop may each have one). */
export function findTourTarget(id: string): HTMLElement | null {
  const all = Array.from(document.querySelectorAll<HTMLElement>(`[data-tour="${id}"]`));
  return all.find((element) => {
    const box = element.getBoundingClientRect();
    return box.width > 0 && box.height > 0 && getComputedStyle(element).visibility !== 'hidden';
  }) ?? null;
}

function stepFits(step: TourStep, fine: boolean) {
  if (step.device === 'touch' && fine) return false;
  if (step.device === 'mouse' && !fine) return false;
  return !step.target || findTourTarget(step.target) !== null;
}

function sameRect(a: Rect | null, b: Rect | null) {
  return a === b || (a !== null && b !== null && Math.abs(a.top - b.top) < 0.5 && Math.abs(a.left - b.left) < 0.5
    && Math.abs(a.width - b.width) < 0.5 && Math.abs(a.height - b.height) < 0.5);
}

/** What the person did on the framed control. */
function gestureOf(dx: number, dy: number): Gesture {
  const distance = Math.hypot(dx, dy);
  if (distance < 12) return 'tap';
  if (Math.abs(dx) > 36 && Math.abs(dx) > Math.abs(dy) * 1.4) return dx < 0 ? 'swipe-left' : 'swipe-right';
  if (dy > 18 && Math.abs(dy) > Math.abs(dx)) return 'resize';
  return 'drag';
}

function accepts(expected: Gesture, done: Gesture) {
  if (expected === done) return true;
  // A swipe either way counts; so does any drag for "drag" and a downward pull for "resize".
  if (expected.startsWith('swipe') && done.startsWith('swipe')) return true;
  if (expected === 'drag' && (done === 'resize' || done.startsWith('swipe'))) return true;
  return false;
}

/** "Try it: tap the light" and the like, by gesture and by touch or mouse. */
function tryKey(gesture: Gesture, fine: boolean): MessageKey {
  const kind = gesture === 'tap' ? 'Tap' : gesture === 'resize' ? 'Resize' : gesture === 'drag' ? 'Drag' : 'Swipe';
  const keys: Record<string, MessageKey> = {
    touchTap: 'tour.try.touchTap', touchSwipe: 'tour.try.touchSwipe', touchDrag: 'tour.try.touchDrag', touchResize: 'tour.try.touchResize',
    mouseTap: 'tour.try.mouseTap', mouseSwipe: 'tour.try.mouseSwipe', mouseDrag: 'tour.try.mouseDrag', mouseResize: 'tour.try.mouseResize',
  };
  return keys[`${fine ? 'mouse' : 'touch'}${kind}`];
}

function GestureHint({ gesture, rect, fine }: { gesture: Gesture; rect: Rect; fine: boolean }) {
  if (gesture === 'none') return null;
  // A touch dot on phones (like screen recordings on iOS), an arrow cursor with a mouse.
  const pointer = fine ? (
    <svg viewBox="0 0 24 24" className="h-7 w-7 drop-shadow-[0_2px_6px_rgba(0,0,0,0.6)]" aria-hidden>
      <path d="M5 3l14 7.5-6.2 1.6L10 19z" fill="white" stroke="#0f172a" strokeWidth="1.4" strokeLinejoin="round" />
    </svg>
  ) : (
    <span className="block h-9 w-9 rounded-full border-2 border-white/90 bg-white/45 shadow-[0_4px_18px_rgba(0,0,0,0.45)] backdrop-blur-[1px]" />
  );
  const centerX = rect.left + rect.width / 2;
  const centerY = rect.top + rect.height / 2;
  const travel = Math.min(140, Math.max(70, rect.width * 0.45));
  // The pointer's tip sits on the spot; a touch dot is centred on it.
  const at = (x: number, y: number) => ({ left: x, top: y, transform: fine ? 'translate(-3px, -3px)' : 'translate(-50%, -50%)' });

  if (gesture === 'tap') {
    return (
      <div className="pointer-events-none fixed z-[302]" style={at(centerX, centerY)}>
        <span className="tour-ripple absolute left-1/2 top-1/2 block h-16 w-16 rounded-full border-2 border-emerald-200/80" style={fine ? { left: 3, top: 3 } : undefined} />
        <span className="tour-finger-tap block">{pointer}</span>
      </div>
    );
  }
  if (gesture === 'swipe-left' || gesture === 'swipe-right') {
    const left = gesture === 'swipe-left';
    const startX = left ? centerX + travel / 2 : centerX - travel / 2;
    return (
      <>
        <div
          className={`tour-trail pointer-events-none fixed z-[301] h-1.5 rounded-full bg-gradient-to-r from-emerald-200/0 via-emerald-200/70 to-emerald-200/0 ${left ? '' : 'tour-trail-right'}`}
          style={{ top: centerY - 3, left: centerX - travel / 2, width: travel }}
        />
        <div className="pointer-events-none fixed z-[302]" style={at(startX, centerY)}>
          <span className="tour-finger-swipe block" style={{ ['--tour-dx' as string]: `${left ? -travel : travel}px` }}>{pointer}</span>
        </div>
      </>
    );
  }
  if (gesture === 'resize') {
    const bottom = rect.top + rect.height;
    return (
      <>
        <div className="tour-stretch pointer-events-none fixed z-[301] rounded-b-2xl border-x-2 border-b-2 border-dashed border-emerald-200/80 bg-emerald-200/10"
          style={{ top: bottom - 6, left: rect.left + 6, width: Math.max(0, rect.width - 12), height: 42 }} />
        <div className="pointer-events-none fixed z-[302]" style={at(centerX, bottom - 4)}>
          <span className="tour-finger-drag block" style={{ ['--tour-dx' as string]: '0px', ['--tour-dy' as string]: '40px' }}>{pointer}</span>
        </div>
      </>
    );
  }
  // Drag: a ghost of the control travels with the finger.
  const dy = Math.min(72, Math.max(44, rect.height * 0.8));
  return (
    <>
      <div className="tour-ghost pointer-events-none fixed z-[301] rounded-2xl border-2 border-emerald-200/80 bg-emerald-300/15"
        style={{ top: rect.top, left: rect.left, width: rect.width, height: Math.min(rect.height, 64), ['--tour-dx' as string]: '0px', ['--tour-dy' as string]: `${dy}px` }} />
      <div className="pointer-events-none fixed z-[302]" style={at(centerX, rect.top + Math.min(rect.height, 64) / 2)}>
        <span className="tour-finger-drag block" style={{ ['--tour-dx' as string]: '0px', ['--tour-dy' as string]: `${dy}px` }}>{pointer}</span>
      </div>
    </>
  );
}

export type TourResult = 'done' | 'skipped' | 'empty';

export function Tour({ steps: allSteps, onClose }: { steps: TourStep[]; onClose: (result: TourResult) => void }) {
  const t = useT();
  const reduced = usePrefersReducedMotion();
  const fine = useFinePointer();
  const titleId = useId();
  // Fixed at the start: steps whose control is missing are left out.
  const steps = useMemo(() => allSteps.filter((step) => stepFits(step, fine)), [allSteps, fine]);
  const [index, setIndex] = useState(0);
  const [rect, setRect] = useState<Rect | null>(null);
  const [viewport, setViewport] = useState({ width: 0, height: 0 });
  const [success, setSuccess] = useState(false);
  const [nudge, setNudge] = useState(0);
  const [follow, setFollow] = useState<{ x: number; y: number } | null>(null);
  const [cardHeight, setCardHeight] = useState(0);
  const cardRef = useRef<HTMLDivElement>(null);
  const press = useRef<{ x: number; y: number; inside: boolean } | null>(null);
  const step = steps[index] ?? null;

  const finish = useCallback((result: TourResult) => onClose(result), [onClose]);
  const next = useCallback(() => {
    setSuccess(false);
    setFollow(null);
    if (index >= steps.length - 1) finish('done');
    else setIndex(index + 1);
  }, [finish, index, steps.length]);
  const back = useCallback(() => {
    setSuccess(false);
    if (index > 0) setIndex(index - 1);
  }, [index]);

  // Nothing to show yet (no control on the page): close; the tour comes again later.
  useEffect(() => {
    if (steps.length === 0) finish('empty');
  }, [finish, steps.length]);

  // Bring the control into view, then follow it every frame (it may move while the page settles).
  useEffect(() => {
    if (!step) return;
    setViewport({ width: window.innerWidth, height: window.innerHeight });
    if (!step.target) {
      setRect(null);
      return;
    }
    const element = findTourTarget(step.target);
    if (!element) {
      next();
      return;
    }
    const box = element.getBoundingClientRect();
    const outside = box.top < 72 || box.bottom > window.innerHeight - 96;
    if (outside) element.scrollIntoView({ block: 'center', behavior: reduced ? 'auto' : 'smooth' });
    let frame = 0;
    let last: Rect | null = null;
    const loop = () => {
      const current = findTourTarget(step.target!) ?? element;
      const b = current.getBoundingClientRect();
      const measured = { top: b.top - PAD, left: b.left - PAD, width: b.width + PAD * 2, height: b.height + PAD * 2 };
      if (!sameRect(last, measured)) {
        last = measured;
        setRect(measured);
      }
      frame = window.requestAnimationFrame(loop);
    };
    loop();
    const resize = () => setViewport({ width: window.innerWidth, height: window.innerHeight });
    window.addEventListener('resize', resize);
    return () => {
      window.cancelAnimationFrame(frame);
      window.removeEventListener('resize', resize);
    };
  }, [step, next, reduced]);

  // The page underneath does not scroll while the tour is open.
  useEffect(() => {
    const stop = (event: Event) => event.preventDefault();
    window.addEventListener('wheel', stop, { passive: false });
    window.addEventListener('touchmove', stop, { passive: false });
    return () => {
      window.removeEventListener('wheel', stop);
      window.removeEventListener('touchmove', stop);
    };
  }, []);

  useEffect(() => {
    const key = (event: KeyboardEvent) => {
      if (event.key === 'Escape') finish('skipped');
      else if (event.key === 'ArrowRight' || event.key === 'Enter') { event.preventDefault(); next(); }
      else if (event.key === 'ArrowLeft') back();
    };
    window.addEventListener('keydown', key);
    return () => window.removeEventListener('keydown', key);
  }, [back, finish, next]);

  useLayoutEffect(() => {
    if (cardRef.current) setCardHeight(cardRef.current.offsetHeight);
  });

  useEffect(() => {
    cardRef.current?.focus({ preventScroll: true });
  }, [index]);

  if (!step) return null;

  const gesture: Gesture = step.gesture ?? 'none';
  const practice = Boolean(step.target) && gesture !== 'none';
  const inside = (x: number, y: number) => rect !== null && x >= rect.left && x <= rect.left + rect.width && y >= rect.top && y <= rect.top + rect.height;

  const onPointerDown = (event: ReactPointerEvent<HTMLDivElement>) => {
    press.current = { x: event.clientX, y: event.clientY, inside: inside(event.clientX, event.clientY) };
    // The finger may end over the card; the gesture still belongs to the light.
    event.currentTarget.setPointerCapture(event.pointerId);
  };
  const onPointerMove = (event: ReactPointerEvent) => {
    if (press.current?.inside && practice && gesture !== 'tap') setFollow({ x: event.clientX, y: event.clientY });
  };
  const onPointerUp = (event: ReactPointerEvent) => {
    const start = press.current;
    press.current = null;
    setFollow(null);
    if (!start) return;
    if (start.inside && practice && accepts(gesture, gestureOf(event.clientX - start.x, event.clientY - start.y))) {
      setSuccess(true);
      window.setTimeout(next, reduced ? 120 : 420);
      return;
    }
    // A tap elsewhere: the card shakes a little to point at itself.
    setNudge((value) => value + 1);
  };

  // The card sits below the control when there is room, else above; centred without a control.
  const margin = 16;
  const phone = viewport.width < 640;
  const cardWidth = phone ? viewport.width - margin * 2 : 380;
  let cardTop: number;
  let cardLeft: number;
  if (!rect) {
    cardTop = Math.max(margin, (viewport.height - cardHeight) / 2);
    cardLeft = (viewport.width - cardWidth) / 2;
  } else {
    // Dragging and pulling need room below the control for the finger.
    const room = gesture === 'drag' || gesture === 'resize' ? 76 : 0;
    const below = rect.top + rect.height + 14 + room;
    const above = rect.top - 14 - cardHeight;
    const fitsBelow = below + cardHeight <= viewport.height - margin;
    cardTop = room > 0 && above >= margin ? above : fitsBelow ? below : above >= margin ? above : viewport.height - cardHeight - margin;
    cardLeft = phone ? margin : Math.min(Math.max(margin, rect.left + rect.width / 2 - cardWidth / 2), viewport.width - cardWidth - margin);
  }
  const move = reduced ? 'none' : `top ${MOVE_MS}ms cubic-bezier(.2,.8,.2,1), left ${MOVE_MS}ms cubic-bezier(.2,.8,.2,1), width ${MOVE_MS}ms cubic-bezier(.2,.8,.2,1), height ${MOVE_MS}ms cubic-bezier(.2,.8,.2,1)`;
  const last = index === steps.length - 1;

  return (
    <div className="fixed inset-0 z-[300]" role="presentation">
      {/* Catches every touch: gestures on the framed control count, nothing reaches the page. */}
      <div
        className="absolute inset-0 touch-none select-none"
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={() => { press.current = null; setFollow(null); }}
      >
        {rect ? (
          <div
            aria-hidden
            className={`absolute rounded-[22px] ${success ? '' : 'tour-glow'}`}
            style={{
              top: rect.top,
              left: rect.left,
              width: rect.width,
              height: rect.height,
              transition: move,
              boxShadow: success ? '0 0 0 3px rgba(110,231,183,1), 0 0 40px 10px rgba(52,211,153,0.55)' : undefined,
            }}
          >
            {/* The dim around the light (kept apart so the glow can pulse on its own). */}
            <div className="absolute inset-0 rounded-[22px]" style={{ boxShadow: '0 0 0 200vmax rgba(2,6,23,0.74)', transition: move }} />
          </div>
        ) : (
          <div aria-hidden className="absolute inset-0 bg-[rgba(2,6,23,0.8)]" />
        )}
      </div>

      {rect && !success && !follow ? <GestureHint key={`${index}-${gesture}`} gesture={reduced ? (gesture === 'none' ? 'none' : 'tap') : gesture} rect={rect} fine={fine} /> : null}
      {follow ? (
        <span aria-hidden className="pointer-events-none fixed z-[302] block h-9 w-9 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-emerald-200 bg-emerald-200/40" style={{ left: follow.x, top: follow.y }} />
      ) : null}

      <div
        ref={cardRef}
        key={`card-${nudge}`}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        tabIndex={-1}
        className={`fixed z-[303] rounded-3xl border border-white/10 bg-slate-900/95 p-4 text-white shadow-[0_24px_80px_rgba(0,0,0,0.55)] outline-none backdrop-blur-xl ${nudge > 0 ? 'tour-nudge' : ''}`}
        style={{ top: cardTop, left: cardLeft, width: cardWidth, transition: reduced ? 'none' : `top ${MOVE_MS}ms cubic-bezier(.2,.8,.2,1), left ${MOVE_MS}ms cubic-bezier(.2,.8,.2,1)`, visibility: cardHeight === 0 ? 'hidden' : 'visible' }}
      >
        <div key={index} className={reduced ? '' : 'animate-[tour-card-in_320ms_cubic-bezier(.2,.8,.2,1)]'}>
          <div className="flex items-start justify-between gap-3">
            <p id={titleId} className="text-base font-black leading-snug">{t(step.title)}</p>
            <button type="button" onClick={() => finish('skipped')} className="shrink-0 rounded-full px-2 py-0.5 text-xs font-black text-slate-400 hover:bg-slate-800 hover:text-white">
              {t('tour.skip')}
            </button>
          </div>
          <p className="mt-1.5 text-sm leading-relaxed text-slate-300" aria-live="polite">{t(step.text)}</p>
          {practice ? (
            <p className="mt-2 flex items-center gap-1.5 text-xs font-black text-emerald-200">
              <span aria-hidden className="inline-block h-1.5 w-1.5 rounded-full bg-emerald-300" />
              {t(tryKey(gesture, fine))}
            </p>
          ) : null}
        </div>
        <div className="mt-3 flex items-center justify-between gap-3">
          <div className="flex items-center gap-1.5" aria-label={t('tour.progress', { step: index + 1, total: steps.length })}>
            {steps.map((_, dot) => (
              <span key={dot} aria-hidden className={`block h-1.5 rounded-full transition-all duration-300 ${dot === index ? 'w-5 bg-emerald-300' : dot < index ? 'w-1.5 bg-emerald-300/50' : 'w-1.5 bg-slate-600'}`} />
            ))}
          </div>
          <div className="flex items-center gap-2">
            {index > 0 ? (
              <button type="button" onClick={back} className="rounded-xl px-3 py-2 text-xs font-black text-slate-300 hover:bg-slate-800 hover:text-white">{t('tour.back')}</button>
            ) : null}
            <button type="button" onClick={next} className="rounded-xl bg-emerald-300 px-4 py-2 text-xs font-black text-slate-950 transition hover:bg-emerald-200">
              {last ? t('tour.done') : t('tour.next')}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
