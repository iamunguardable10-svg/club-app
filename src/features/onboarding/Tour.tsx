'use client';

/** A real hole in the light: events reach the app, and observed results move on. */
import { useCallback, useEffect, useId, useLayoutEffect, useRef, useState } from 'react';
import { endPractice, isPracticeActive, readDatabase, startPractice, subscribe, type LocalDatabase } from '@/shared/data';
import { useT, type MessageKey } from '@/shared/i18n';
import { preparePractice, type Gesture, type TourContext, type TourId, type TourStep } from './tours';

type Rect = { top: number; left: number; width: number; height: number };
const PAD = 8;
const sameRect = (a: Rect | null, b: Rect) => Boolean(a && Math.abs(a.top - b.top) < .5 && Math.abs(a.left - b.left) < .5 && Math.abs(a.width - b.width) < .5 && Math.abs(a.height - b.height) < .5);
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
type Phase = 'arrive' | 'show' | 'result' | 'leave';

function visible(element: HTMLElement | null): element is HTMLElement {
  return Boolean(element && element.getBoundingClientRect().width && element.getBoundingClientRect().height);
}

export function Tour({ id, steps: allSteps, onClose }: { id: TourId; steps: TourStep[]; onClose: (result: TourResult) => void }) {
  const t = useT();
  const reduced = usePrefersReducedMotion();
  const fine = useFinePointer();
  const titleId = useId();
  const [index, setIndex] = useState(0);
  const [phase, setPhase] = useState<Phase>('arrive');
  const [hint, setHint] = useState(false);
  const [nudge, setNudge] = useState(false);
  const [gesturing, setGesturing] = useState(false);
  const targetRef = useRef<HTMLElement | null>(null);
  const [rect, setRect] = useState<Rect | null>(null);
  const [viewport, setViewport] = useState({ width: 0, height: 0 });
  const [cardHeight, setCardHeight] = useState(180);
  const [started, setStarted] = useState(false);
  const cardRef = useRef<HTMLDivElement>(null);
  const context = useRef<TourContext | null>(null);
  const finished = useRef(false);
  const closeRef = useRef(onClose);
  closeRef.current = onClose;
  const timers = useRef<number[]>([]);
  const practiceTour = !id.startsWith('moment.') || allSteps.some((step) => step.kind === 'do');
  const entered = useRef(-1);
  const steps = allSteps.filter((step) => step.device !== (fine ? 'touch' : 'mouse'));
  const step = steps[index];

  const clearTimers = useCallback(() => {
    timers.current.forEach(window.clearTimeout);
    timers.current = [];
  }, []);
  const later = useCallback((ms: number, action: () => void) => {
    timers.current.push(window.setTimeout(action, ms));
  }, []);
  const finish = useCallback((result: TourResult) => {
    if (finished.current) return;
    finished.current = true;
    clearTimers();
    endPractice();
    closeRef.current(result);
  }, [clearTimers]);
  const next = useCallback(() => {
    if (finished.current) return;
    clearTimers();
    try { step?.leave?.(); } catch { finish('skipped'); return; }
    setPhase('leave');
    setHint(false);
    later(reduced ? 0 : 220, () => {
      if (index + 1 >= steps.length) finish('done');
      else setIndex(index + 1);
    });
  }, [clearTimers, finish, index, later, reduced, steps.length, step]);

  useEffect(() => {
    finished.current = false;
    const previousFocus = document.activeElement as HTMLElement | null;
    try {
      if (practiceTour) startPractice();
      const initial = structuredClone(readDatabase()) as LocalDatabase | null;
      if (!initial) { finish('empty'); return; }
      context.current = { initial, before: initial, memory: {} };
      entered.current = -1;
      if (practiceTour) preparePractice(id);
      setStarted(true);
    } catch { finish('skipped'); }
    const failed = () => finish('skipped');
    window.addEventListener('error', failed);
    window.addEventListener('unhandledrejection', failed);
    return () => {
      finished.current = true;
      clearTimers();
      endPractice();
      window.removeEventListener('error', failed);
      window.removeEventListener('unhandledrejection', failed);
      if (previousFocus?.isConnected) previousFocus.focus({ preventScroll: true });
    };
  }, [clearTimers, finish, id, practiceTour]);

  // Targets are resolved during each step, including controls created by the
  // previous action. A tour's own sheets are never postponed by TourHost.
  useEffect(() => {
    if (!started || !step || !context.current) return;
    clearTimers();
    const ctx = context.current;
    const database = readDatabase();
    if (!database) { finish('empty'); return; }
    if (step.when && !step.when(database)) { next(); return; }
    if (entered.current !== index) {
      ctx.before = structuredClone(database);
      entered.current = index;
      try { step.enter?.(); } catch { finish('skipped'); return; }
    }
    setPhase('arrive'); setHint(false); setNudge(false);
    let currentPhase: Phase = 'arrive';
    let frame = 0;
    let scrolled: HTMLElement | null = null;
    let missingSince = performance.now();
    let previous: Rect | null = null;
    const resolve = () => currentPhase === 'result' && step.resultTarget ? step.resultTarget(readDatabase()!, ctx) : typeof step.target === 'function'
      ? step.target(readDatabase()!, ctx)
      : step.target ? findTourTarget(step.target) : null;
    const success = () => {
      if (currentPhase === 'result' || finished.current) return;
      currentPhase = 'result';
      clearTimers(); setPhase('result'); setHint(false);
      later(1400, next); // Keep the finished real result visible, even with reduced motion.
    };
    const observe = () => {
      if (finished.current) return;
      try {
        if (practiceTour && !isPracticeActive()) { finish('skipped'); return; }
        const db = readDatabase();
        if (step.kind === 'do' && db && step.expected?.(db, ctx)) success();
      } catch { finish('skipped'); }
    };
    const measure = () => {
      if (finished.current) return;
      const width = window.innerWidth;
      const height = window.visualViewport?.height ?? window.innerHeight;
      setViewport((old) => old.width === width && old.height === height ? old : { width, height });
      const element = resolve();
      if (targetRef.current !== element) {
        targetRef.current?.removeAttribute('data-tour-active');
        element?.setAttribute('data-tour-active', 'true');
        targetRef.current = element;
      }
      if (visible(element)) {
        missingSince = performance.now();
        const b = element.getBoundingClientRect();
        if (!element.closest('[aria-modal="true"]') && scrolled !== element && (b.top < 64 || b.bottom > height - 80)) {
          scrolled = element;
          element.scrollIntoView({ block: b.height > height * .6 ? 'start' : 'center', behavior: reduced ? 'instant' : 'smooth' });
        }
        // Only the visible part of a long calendar column is framed. Gestures
        // continue beyond the hole; the dim panels yield during an active gesture.
        const top = Math.max(b.height > height - cardHeight - 60 ? cardHeight + 32 : 8, b.top - PAD);
        const bottom = Math.min(height - 8, b.bottom + PAD);
        const measured = { top, left: Math.max(0, b.left - PAD), width: Math.min(width, b.right + PAD) - Math.max(0, b.left - PAD), height: Math.max(0, bottom - top) };
        if (!sameRect(previous, measured)) { previous = measured; setRect(measured); }
      } else {
        if (previous) { previous = null; setRect(null); }
        // Informational steps may be absent due to role, data or feature flags.
        // Required actions wait for their newly opened UI and keep Next/Skip.
        if (step.kind !== 'do' && step.target && performance.now() - missingSince > 1200) { next(); return; }
      }
      observe();
      frame = window.requestAnimationFrame(measure);
    };
    measure();
    const stop = subscribe(observe);
    later(reduced ? 0 : 420, () => {
      if (currentPhase !== 'result') { currentPhase = 'show'; setPhase('show'); later(650, () => setHint(true)); }
    });
    return () => { stop(); targetRef.current?.removeAttribute('data-tour-active'); targetRef.current = null; window.cancelAnimationFrame(frame); clearTimers(); };
  }, [started, step, index, reduced, practiceTour, clearTimers, finish, later, next, cardHeight]);

  useLayoutEffect(() => {
    if (cardRef.current) setCardHeight(cardRef.current.offsetHeight);
  }, [phase, index, nudge, viewport.width]);
  useEffect(() => {
    if (phase === 'show' && step?.kind !== 'do') cardRef.current?.focus({ preventScroll: true });
  }, [phase, step]);
  useEffect(() => {
    const key = (event: KeyboardEvent) => {
      // Text fields, selects and real controls keep their own Enter/arrows/Esc.
      if (event.key === 'Tab') {
        const aim = targetRef.current;
        const candidates = [
          ...(step?.kind === 'do' && aim ? [aim, ...aim.querySelectorAll<HTMLElement>('button,input,textarea,select,a,[tabindex]')] : []),
          ...cardRef.current?.querySelectorAll<HTMLElement>('button') ?? [],
        ].filter((node) => node.matches('button,input,textarea,select,a,[tabindex]') && !node.matches(':disabled') && node.getBoundingClientRect().width > 0);
        const current = candidates.indexOf(document.activeElement as HTMLElement);
        const chosen = candidates[(current + (event.shiftKey ? -1 : 1) + candidates.length) % candidates.length];
        event.preventDefault(); event.stopImmediatePropagation(); chosen?.focus(); return;
      }
      const editing = event.target instanceof HTMLElement && event.target.closest('input,textarea,select,[contenteditable]');
      if (editing && event.key !== 'Escape') return;
      if (event.key === 'Escape') { event.preventDefault(); event.stopImmediatePropagation(); finish('skipped'); }
      else if ((event.key === 'Enter' || event.key === 'ArrowRight') && (!event.target || event.target === document.body || cardRef.current?.contains(event.target as Node))) {
        event.preventDefault(); next();
      }
      else if (event.key === 'ArrowLeft' && step?.kind !== 'do' && index > 0) { clearTimers(); entered.current = -1; setIndex(index - 1); }
    };
    window.addEventListener('keydown', key, true);
    return () => window.removeEventListener('keydown', key, true);
  }, [clearTimers, finish, index, next, step]);

  useEffect(() => {
    const down = (event: PointerEvent) => {
      if (step?.kind === 'do' && event.target instanceof Node && targetRef.current?.contains(event.target)) setGesturing(true);
    };
    const up = () => setGesturing(false);
    window.addEventListener('pointerdown', down, true);
    window.addEventListener('pointerup', up, true);
    window.addEventListener('pointercancel', up, true);
    return () => { window.removeEventListener('pointerdown', down, true); window.removeEventListener('pointerup', up, true); window.removeEventListener('pointercancel', up, true); };
  }, [step]);

  if (!step || !started) return null;
  const gesture = step.gesture ?? 'none';
  const success = phase === 'result';
  const margin = 12;
  const width = Math.max(0, Math.min(380, viewport.width - margin * 2));
  const below = rect ? rect.top + rect.height + 14 : 0;
  const above = rect ? rect.top - cardHeight - 14 : 0;
  const top = rect ? (below + cardHeight <= viewport.height - margin ? below : above >= margin ? above : margin) : Math.max(margin, viewport.height - cardHeight - margin);
  const left = viewport.width < 640 ? margin : rect ? Math.min(Math.max(margin, rect.left + rect.width / 2 - width / 2), viewport.width - width - margin) : (viewport.width - width) / 2;
  const shown = phase === 'show' || success;
  const panel = (key: string, x: number, y: number, w: number, h: number) => (
    <div key={key} aria-hidden onPointerDown={(event) => { if (event.buttons) setNudge(true); }} className="pointer-events-auto fixed bg-slate-950/70" style={{ pointerEvents: gesturing ? 'none' : 'auto', left: x, top: y, width: Math.max(0, w), height: Math.max(0, h) }} />
  );
  return (
    <div data-practice-active={practiceTour ? 'true' : undefined} className="pointer-events-none fixed inset-0 z-[300]">
      {rect ? <>
        {panel('top', 0, 0, viewport.width, rect.top)}
        {panel('left', 0, rect.top, rect.left, rect.height)}
        {panel('right', rect.left + rect.width, rect.top, viewport.width - rect.left - rect.width, rect.height)}
        {panel('bottom', 0, rect.top + rect.height, viewport.width, viewport.height - rect.top - rect.height)}
        <div aria-hidden className="pointer-events-none tour-glow fixed rounded-2xl border-2 border-emerald-200/80" style={{ width: rect.width, height: rect.height, transform: `translate3d(${rect.left}px,${rect.top}px,0)`, transition: reduced ? 'none' : 'transform 380ms cubic-bezier(.2,.8,.2,1)' }} />
      </> : panel('all', 0, 0, viewport.width, viewport.height)}
      <style>{`body:has([data-practice-active="true"]) [aria-modal="true"]:not([data-welcome]) { background-color: transparent; backdrop-filter: none; padding-top: ${cardHeight + 32}px; } body:has([data-practice-active="true"]) [aria-modal="true"]:not([data-welcome]) > section, body:has([data-practice-active="true"]) [aria-modal="true"]:not([data-welcome]) > div { max-height: calc(100dvh - ${cardHeight + 48}px); overflow-y: auto; }`}</style>
      {rect && success ? <span aria-hidden data-tour-success className="fixed grid h-9 w-9 place-items-center rounded-full bg-emerald-300 text-xl font-black text-slate-950 shadow-lg" style={{ transform: `translate3d(${rect.left + rect.width - 24}px,${rect.top - 8}px,0)` }}>✓</span> : null}
      {rect && (step.kind !== 'do' || success) ? <div className="pointer-events-auto fixed" onPointerDown={() => setNudge(true)} style={{ left: rect.left, top: rect.top, width: rect.width, height: rect.height }} /> : null}
      {rect && hint && shown && !success && !reduced ? <GestureHint gesture={gesture} rect={rect} fine={fine} /> : null}
      <div ref={cardRef} role="dialog" aria-labelledby={titleId} aria-describedby={`${titleId}-text`} tabIndex={-1}
        data-tour-key={step.title} data-tour-kind={step.kind ?? 'show'} data-tour-gesture={gesture} data-tour-phase={phase}
        className="pointer-events-auto fixed rounded-3xl border border-white/10 bg-slate-900 p-4 text-white shadow-2xl outline-none"
        style={{ width, transform: `translate3d(${left}px,${top + (shown ? 0 : 8)}px,0)`, opacity: shown ? 1 : 0, transition: reduced ? 'none' : 'transform 380ms cubic-bezier(.2,.8,.2,1), opacity 240ms ease' }}>
        <div className="flex items-start justify-between gap-3">
          <p id={titleId} className="text-base font-black">{t(step.title)}{index === 0 && practiceTour ? <span className="ml-2 rounded-full bg-emerald-300/10 px-2 py-1 align-middle text-[10px] text-emerald-200">{t('tour.practice.new')}</span> : null}</p>
          <button type="button" data-tour-skip onClick={() => finish('skipped')} className="rounded-full px-2 py-1 text-xs font-black text-slate-400 hover:text-white">{t('tour.skip')}</button>
        </div>
        <p id={`${titleId}-text`} className="mt-1.5 text-sm leading-relaxed text-slate-300">{t(step.text)}</p>
        <p aria-live="polite" aria-atomic="true" className="mt-2 min-h-5 text-xs font-bold text-emerald-200">
          {success ? <>✓ {t(step.result ?? 'tour.result.generic')}</> : nudge ? t('tour.practice.hint') : practiceTour ? t('tour.practice.safe') : ''}
        </p>
        <div className="mt-3 flex items-center justify-between gap-3">
          <span className="text-xs text-slate-400">{t('tour.progress', { step: index + 1, total: steps.length })}</span>
          <button type="button" data-tour-next onClick={next} className="rounded-xl bg-emerald-300 px-4 py-2 text-xs font-black text-slate-950 transition active:scale-95">{t(index === steps.length - 1 ? 'tour.done' : 'tour.next')}</button>
        </div>
      </div>
    </div>
  );
}
