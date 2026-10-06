'use client';

/**
 * A guided tour over the real page, in the manner of iOS onboarding: the rest
 * of the screen dims, a light frames one control, a finger (on phones) or a
 * cursor (with a mouse) shows the gesture, and a card says in one sentence
 * what it does. Each step takes its time: the light glides over, the card
 * comes in, then the hint starts.
 *
 * Doing the gesture works like in the app: a copy of the control is lifted
 * and follows the finger (dragged, pulled longer, swiped away and the next
 * day sliding in), and on letting go the result stays on screen for a moment
 * with a sentence about what just happened – then the tour moves on. Nothing
 * reaches the page underneath, so a tour never changes data. "Next", "Back",
 * "Skip" and the keyboard (→ ← Esc) work too. Steps whose control is not on
 * the page (another role, a team without load tracking, a phone-only gesture
 * on a desktop) are left out.
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

/** arrive: the light glides over · show: card and hint · result: what the gesture did · leave: fading out. */
type Phase = 'arrive' | 'show' | 'result' | 'leave';

const ARRIVE_MS = 420;
const HINT_DELAY_MS = 650;
const RESULT_MS = 1600;
const LEAVE_MS = 220;
const SPRING = 'cubic-bezier(.2,1.25,.35,1)';

/** A lifted copy of the control that follows the finger; never part of the page. */
type Lift = { element: HTMLElement; base: DOMRect };

function liftCopy(target: HTMLElement, layer: HTMLElement): Lift {
  const base = target.getBoundingClientRect();
  const computed = getComputedStyle(target);
  const copy = target.cloneNode(true) as HTMLElement;
  // No second target, no ids, nothing focusable.
  for (const node of [copy, ...Array.from(copy.querySelectorAll<HTMLElement>('*'))]) {
    node.removeAttribute('data-tour');
    node.removeAttribute('id');
    node.setAttribute('tabindex', '-1');
  }
  copy.setAttribute('aria-hidden', 'true');
  const transparent = computed.backgroundColor === 'rgba(0, 0, 0, 0)' || computed.backgroundColor === 'transparent';
  Object.assign(copy.style, {
    position: 'fixed',
    top: `${base.top}px`,
    left: `${base.left}px`,
    right: 'auto',
    bottom: 'auto',
    width: `${base.width}px`,
    height: `${base.height}px`,
    margin: '0',
    boxSizing: 'border-box',
    overflow: 'hidden',
    pointerEvents: 'none',
    color: computed.color,
    fontSize: computed.fontSize,
    fontWeight: computed.fontWeight,
    lineHeight: computed.lineHeight,
    borderRadius: computed.borderRadius === '0px' ? '16px' : computed.borderRadius,
    background: transparent ? 'rgb(15, 23, 42)' : computed.backgroundColor,
    transformOrigin: 'center',
    transition: 'none',
    willChange: 'transform, height, opacity',
  });
  layer.appendChild(copy);
  return { element: copy, base };
}

function lifted(lift: Lift, transform: string, height?: number) {
  const style = lift.element.style;
  style.transition = 'box-shadow 160ms ease';
  style.transform = transform;
  style.boxShadow = '0 22px 60px rgba(0,0,0,0.55), 0 0 0 2px rgba(110,231,183,0.85)';
  if (height !== undefined) style.height = `${height}px`;
}

function animateTo(lift: Lift, transform: string, ms: number, extra: Partial<CSSStyleDeclaration> = {}) {
  const style = lift.element.style;
  style.transition = `transform ${ms}ms ${SPRING}, height ${ms}ms ${SPRING}, opacity ${ms}ms ease, box-shadow ${ms}ms ease`;
  style.transform = transform;
  Object.assign(style, extra);
}

/** "Done" for the senses: a short buzz where the phone can (Android). */
function buzz() {
  try {
    navigator.vibrate?.(12);
  } catch {
    // Not supported: nothing to feel.
  }
}

function CheckBadge({ rect }: { rect: Rect }) {
  return (
    <span
      aria-hidden
      className="pointer-events-none fixed z-[304] grid h-8 w-8 animate-[tour-pop_420ms_cubic-bezier(.2,1.4,.35,1)] place-items-center rounded-full bg-emerald-300 text-slate-950 shadow-[0_8px_30px_rgba(16,185,129,0.55)]"
      style={{ top: rect.top - 12, left: rect.left + rect.width - 20 }}
    >
      <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth={3} strokeLinecap="round" strokeLinejoin="round"><path d="M5 12.5l4.5 4.5L19 7.5" /></svg>
    </span>
  );
}

export function Tour({ steps: allSteps, onClose }: { steps: TourStep[]; onClose: (result: TourResult) => void }) {
  const t = useT();
  const reduced = usePrefersReducedMotion();
  const fine = useFinePointer();
  const titleId = useId();
  // Fixed at the start: steps whose control is missing are left out.
  const steps = useMemo(() => allSteps.filter((step) => stepFits(step, fine)), [allSteps, fine]);
  const [index, setIndex] = useState(0);
  const [phase, setPhase] = useState<Phase>('arrive');
  const [hint, setHint] = useState(false);
  const [entered, setEntered] = useState(false);
  const [closing, setClosing] = useState(false);
  const [rect, setRect] = useState<Rect | null>(null);
  const [viewport, setViewport] = useState({ width: 0, height: 0 });
  const [nudge, setNudge] = useState(0);
  const [pressing, setPressing] = useState(false);
  const [cardHeight, setCardHeight] = useState(0);
  const cardRef = useRef<HTMLDivElement>(null);
  const liftLayer = useRef<HTMLDivElement>(null);
  const lift = useRef<Lift | null>(null);
  const press = useRef<{ x: number; y: number; inside: boolean } | null>(null);
  const timers = useRef<number[]>([]);
  const phaseRef = useRef<Phase>('arrive');
  phaseRef.current = phase;
  const step = steps[index] ?? null;
  const speed = reduced ? 0.35 : 1;

  const later = useCallback((ms: number, run: () => void) => {
    timers.current.push(window.setTimeout(run, ms * speed));
  }, [speed]);
  const clearTimers = () => {
    for (const timer of timers.current) window.clearTimeout(timer);
    timers.current = [];
  };
  const dropLift = useCallback(() => {
    lift.current?.element.remove();
    lift.current = null;
  }, []);
  useEffect(() => () => { clearTimers(); dropLift(); }, [dropLift]);

  useEffect(() => {
    const frame = window.requestAnimationFrame(() => setEntered(true));
    return () => window.cancelAnimationFrame(frame);
  }, []);

  const finish = useCallback((result: TourResult) => {
    clearTimers();
    setClosing(true);
    later(LEAVE_MS + 40, () => onClose(result));
  }, [later, onClose]);

  /** Fades the card and the lifted copy out, then goes to step `target` (or ends). */
  const goTo = useCallback((target: number) => {
    if (phaseRef.current === 'leave') return;
    clearTimers();
    setPhase('leave');
    setHint(false);
    if (lift.current) animateTo(lift.current, lift.current.element.style.transform, LEAVE_MS, { opacity: '0' });
    later(LEAVE_MS, () => {
      dropLift();
      if (target >= steps.length) {
        finish('done');
        return;
      }
      setIndex(Math.max(0, target));
    });
  }, [dropLift, finish, later, steps.length]);
  const next = useCallback(() => goTo(index + 1), [goTo, index]);
  const back = useCallback(() => { if (index > 0) goTo(index - 1); }, [goTo, index]);

  // Nothing to show yet (no control on the page): close; the tour comes again later.
  useEffect(() => {
    if (steps.length === 0) onClose('empty');
  }, [onClose, steps.length]);

  // Each step: the light glides over (and the page scrolls), then the card, then the hint.
  useEffect(() => {
    if (!step) return;
    setPhase('arrive');
    setHint(false);
    setViewport({ width: window.innerWidth, height: window.innerHeight });
    let scrolled = false;
    let frame = 0;
    const cleanups: Array<() => void> = [];
    if (!step.target) {
      setRect(null);
    } else {
      const element = findTourTarget(step.target);
      if (!element) {
        goTo(index + 1);
        return;
      }
      const box = element.getBoundingClientRect();
      // A tall area (a squad list, the weekly plan) is shown from its top.
      const tall = box.height > window.innerHeight * 0.55;
      const outside = box.top < 72 || box.bottom > window.innerHeight - 96;
      if (tall) {
        element.style.scrollMarginTop = '88px';
        element.scrollIntoView({ block: 'start', behavior: reduced ? 'auto' : 'smooth' });
        scrolled = true;
      } else if (outside) {
        element.scrollIntoView({ block: 'center', behavior: reduced ? 'auto' : 'smooth' });
        scrolled = true;
      }
      const cap = Math.max(180, window.innerHeight * 0.36);
      let last: Rect | null = null;
      const loop = () => {
        const current = findTourTarget(step.target!) ?? element;
        const b = current.getBoundingClientRect();
        const height = tall ? Math.min(b.height, cap) : b.height;
        const measured = { top: b.top - PAD, left: b.left - PAD, width: b.width + PAD * 2, height: height + PAD * 2 };
        if (!sameRect(last, measured)) {
          last = measured;
          setRect(measured);
        }
        frame = window.requestAnimationFrame(loop);
      };
      loop();
      cleanups.push(() => window.cancelAnimationFrame(frame));
    }
    const resize = () => setViewport({ width: window.innerWidth, height: window.innerHeight });
    window.addEventListener('resize', resize);
    cleanups.push(() => window.removeEventListener('resize', resize));
    // A breath before the card: longer when the page had to scroll.
    later(ARRIVE_MS + (scrolled ? 320 : 0), () => {
      setPhase('show');
      later(HINT_DELAY_MS, () => setHint(true));
    });
    return () => { for (const cleanup of cleanups) cleanup(); };
    // `goTo` and `later` only change with the step count and the speed.
  }, [step, index, reduced]);

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
    if (phase === 'show') cardRef.current?.focus({ preventScroll: true });
  }, [phase]);

  if (!step) return null;

  const gesture: Gesture = step.gesture ?? 'none';
  const practice = Boolean(step.target) && gesture !== 'none';
  const inside = (x: number, y: number) => rect !== null && x >= rect.left && x <= rect.left + rect.width && y >= rect.top && y <= rect.top + rect.height;
  const success = phase === 'result';
  // The light is there already while the card comes in: the gesture counts from then on.
  const live = (phase === 'show' || phase === 'arrive') && rect !== null;

  const onPointerDown = (event: ReactPointerEvent<HTMLDivElement>) => {
    const isInside = inside(event.clientX, event.clientY);
    press.current = { x: event.clientX, y: event.clientY, inside: isInside };
    // The finger may end over the card; the gesture still belongs to the light.
    event.currentTarget.setPointerCapture(event.pointerId);
    if (!live || !practice || !isInside || !liftLayer.current) return;
    const target = findTourTarget(step.target!);
    if (!target) return;
    dropLift();
    lift.current = liftCopy(target, liftLayer.current);
    setPressing(true);
    // Pressed: it sinks in a little, like a real button.
    if (gesture === 'tap') animateTo(lift.current, 'scale(0.96)', 120);
    else lifted(lift.current, 'scale(1.03)');
  };
  const onPointerMove = (event: ReactPointerEvent) => {
    const start = press.current;
    const copy = lift.current;
    if (!start?.inside || !copy || gesture === 'tap') return;
    const dx = event.clientX - start.x;
    const dy = event.clientY - start.y;
    if (gesture === 'drag') lifted(copy, `translate(${dx}px, ${dy}px) scale(1.03)`);
    else if (gesture === 'resize') lifted(copy, 'none', Math.max(copy.base.height, Math.min(copy.base.height + 140, copy.base.height + dy)));
    else lifted(copy, `translateX(${dx}px) rotate(${dx / 40}deg)`);
  };
  const onPointerUp = (event: ReactPointerEvent) => {
    const start = press.current;
    press.current = null;
    setPressing(false);
    if (!start) return;
    const copy = lift.current;
    const dx = event.clientX - start.x;
    const dy = event.clientY - start.y;
    if (live && start.inside && practice && accepts(gesture, gestureOf(dx, dy))) {
      clearTimers();
      setPhase('result');
      setHint(false);
      buzz();
      if (copy) {
        if (gesture === 'drag') {
          // Snaps into its new place, like a session on the quarter hour.
          animateTo(copy, `translate(${Math.round(dx / 12) * 12}px, ${Math.round(dy / 24) * 24}px) scale(1)`, 420);
        } else if (gesture === 'resize') {
          animateTo(copy, 'none', 420, { height: `${Math.max(copy.base.height + 36, Math.min(copy.base.height + 140, copy.base.height + Math.round(dy / 24) * 24))}px` });
        } else if (gesture.startsWith('swipe')) {
          // Swiped away; the next one slides in from the other side.
          const away = dx < 0 ? -1 : 1;
          animateTo(copy, `translateX(${away * window.innerWidth}px)`, 260, { opacity: '0' });
          later(270, () => {
            if (!lift.current) return;
            const style = lift.current.element.style;
            style.transition = 'none';
            style.transform = `translateX(${-away * 70}px)`;
            style.opacity = '0';
            later(30, () => { if (lift.current) animateTo(lift.current, 'none', 380, { opacity: '1' }); });
          });
        } else {
          animateTo(copy, 'scale(1)', 380);
        }
      }
      later(RESULT_MS, () => goTo(index + 1));
      return;
    }
    // Not quite: the copy springs back, the card shakes a little.
    if (copy) {
      animateTo(copy, 'none', 320, { height: `${copy.base.height}px` });
      later(330, dropLift);
    }
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
    // Dragging, pulling and swiping need room for the finger and the result.
    const room = gesture === 'drag' || gesture === 'resize' ? 150 : 0;
    const below = rect.top + rect.height + 14 + room;
    const above = rect.top - 14 - cardHeight;
    const fitsBelow = below + cardHeight <= viewport.height - margin;
    cardTop = room > 0 && above >= margin ? above : fitsBelow ? below : above >= margin ? above : viewport.height - cardHeight - margin;
    cardLeft = phone ? margin : Math.min(Math.max(margin, rect.left + rect.width / 2 - cardWidth / 2), viewport.width - cardWidth - margin);
  }
  const ease = 'cubic-bezier(.2,.8,.2,1)';
  const move = reduced ? 'none' : `top ${MOVE_MS}ms ${ease}, left ${MOVE_MS}ms ${ease}, width ${MOVE_MS}ms ${ease}, height ${MOVE_MS}ms ${ease}`;
  const cardShown = phase === 'show' || phase === 'result';
  const last = index === steps.length - 1;
  const resultText = step.result ? t(step.result) : t('tour.result.generic');

  return (
    <div
      className="fixed inset-0 z-[300]"
      role="presentation"
      style={{ opacity: entered && !closing ? 1 : 0, transition: reduced ? 'none' : `opacity ${LEAVE_MS + 60}ms ease` }}
    >
      {/* Catches every touch: gestures on the framed control count, nothing reaches the page. */}
      <div
        className="absolute inset-0 touch-none select-none"
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={() => { press.current = null; setPressing(false); dropLift(); }}
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
              transition: `${move}, box-shadow 300ms ease`,
              boxShadow: success ? '0 0 0 3px rgba(110,231,183,1), 0 0 44px 12px rgba(52,211,153,0.5)' : undefined,
            }}
          >
            {/* The dim around the light (kept apart so the glow can pulse on its own). */}
            <div className="absolute inset-0 rounded-[22px]" style={{ boxShadow: '0 0 0 200vmax rgba(2,6,23,0.74)', transition: move }} />
          </div>
        ) : (
          <div aria-hidden className="absolute inset-0 bg-[rgba(2,6,23,0.8)]" />
        )}
      </div>

      {/* The lifted copy lives here, above the dim and below the card. */}
      <div ref={liftLayer} aria-hidden className="pointer-events-none fixed inset-0 z-[301]" />

      {rect && hint && live && !pressing ? <GestureHint key={`${index}-${gesture}`} gesture={reduced ? (gesture === 'none' ? 'none' : 'tap') : gesture} rect={rect} fine={fine} /> : null}
      {rect && success ? <CheckBadge rect={rect} /> : null}

      <div
        ref={cardRef}
        key={`card-${nudge}`}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        data-tour-gesture={gesture}
        data-tour-phase={phase}
        tabIndex={-1}
        className={`fixed z-[303] rounded-3xl border border-white/10 bg-slate-900/95 p-4 text-white shadow-[0_24px_80px_rgba(0,0,0,0.55)] outline-none backdrop-blur-xl ${nudge > 0 ? 'tour-nudge' : ''}`}
        style={{
          top: cardTop,
          left: cardLeft,
          width: cardWidth,
          opacity: cardShown && cardHeight > 0 ? 1 : 0,
          transform: cardShown ? 'translateY(0) scale(1)' : 'translateY(10px) scale(0.98)',
          pointerEvents: cardShown ? 'auto' : 'none',
          transition: reduced ? 'none' : `top ${MOVE_MS}ms ${ease}, left ${MOVE_MS}ms ${ease}, opacity 240ms ease, transform 300ms ${ease}`,
        }}
      >
        <div className="flex items-start justify-between gap-3">
          <p id={titleId} className="text-base font-black leading-snug">{t(step.title)}</p>
          <button type="button" onClick={() => finish('skipped')} className="shrink-0 rounded-full px-2 py-0.5 text-xs font-black text-slate-400 hover:bg-slate-800 hover:text-white">
            {t('tour.skip')}
          </button>
        </div>
        <p className="mt-1.5 text-sm leading-relaxed text-slate-300">{t(step.text)}</p>
        {practice ? (
          <div className="relative mt-2 min-h-[1.25rem]" aria-live="polite">
            {success ? (
              <p key="result" className="flex animate-[tour-card-in_280ms_cubic-bezier(.2,.8,.2,1)] items-start gap-1.5 text-xs font-black text-emerald-200">
                <svg viewBox="0 0 24 24" className="mt-px h-3.5 w-3.5 shrink-0" aria-hidden fill="none" stroke="currentColor" strokeWidth={3} strokeLinecap="round" strokeLinejoin="round"><path d="M5 12.5l4.5 4.5L19 7.5" /></svg>
                {resultText}
              </p>
            ) : (
              <p key="try" className="flex items-center gap-1.5 text-xs font-black text-emerald-200">
                <span aria-hidden className="inline-block h-1.5 w-1.5 animate-pulse rounded-full bg-emerald-300" />
                {t(tryKey(gesture, fine))}
              </p>
            )}
          </div>
        ) : null}
        <div className="mt-3 flex items-center justify-between gap-3">
          <div className="flex items-center gap-1.5" aria-label={t('tour.progress', { step: index + 1, total: steps.length })}>
            {steps.map((_, dot) => (
              <span key={dot} aria-hidden className={`block h-1.5 rounded-full transition-all duration-500 ${dot === index ? 'w-5 bg-emerald-300' : dot < index ? 'w-1.5 bg-emerald-300/50' : 'w-1.5 bg-slate-600'}`} />
            ))}
          </div>
          <div className="flex items-center gap-2">
            {index > 0 ? (
              <button type="button" onClick={back} className="rounded-xl px-3 py-2 text-xs font-black text-slate-300 hover:bg-slate-800 hover:text-white">{t('tour.back')}</button>
            ) : null}
            <button type="button" onClick={next} className="rounded-xl bg-emerald-300 px-4 py-2 text-xs font-black text-slate-950 transition hover:bg-emerald-200 active:scale-95">
              {last ? t('tour.done') : t('tour.next')}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
