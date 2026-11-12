'use client';

/**
 * First-use tips (Ben, 2026-11-12: "active, while you discover the app, like
 * in so many apps"). On a page's first visits, one small bubble at a time
 * points at a real control (`data-tip="…"`), the rest of the screen dimmed.
 * The app stays usable: the highlighted control can be tapped right away,
 * which also counts as seen. "Got it" goes to the next tip, "No more tips"
 * turns them off (back on in the settings). Every tip shows once per device.
 *
 * Nothing shows while a dialog is open, and only after the page has settled.
 */

import { useEffect, useRef, useState } from 'react';

import { isTipSeen, markTipSeen, setTipsOff } from '@/shared/data';
import { useT, type MessageKey } from '@/shared/i18n';

export type Tip = { id: string; target: string; text: MessageKey };

/** The visible element for a tip's target (the phone tab bar or the side bar, whichever shows). */
function findTarget(target: string): HTMLElement | null {
  for (const element of document.querySelectorAll<HTMLElement>(`[data-tip="${target}"]`)) {
    const box = element.getBoundingClientRect();
    if (box.width > 0 && box.height > 0 && getComputedStyle(element).visibility !== 'hidden') return element;
  }
  return null;
}

const dialogOpen = () => Boolean(document.querySelector('[role="dialog"], [aria-modal="true"], dialog[open]'));

export function TipLayer({ tips }: { tips: Tip[] }) {
  const t = useT();
  const [current, setCurrent] = useState<{ tip: Tip; index: number; total: number } | null>(null);
  const [box, setBox] = useState<DOMRect | null>(null);
  const lastBox = useRef('');
  const [round, setRound] = useState(0);
  const key = tips.map((tip) => tip.id).join('|');

  // Which tip is next: the first unseen one whose control is on screen.
  useEffect(() => {
    setCurrent(null);
    let cancelled = false;
    const timer = window.setInterval(() => {
      if (cancelled || dialogOpen()) return;
      const open = tips.filter((tip) => !isTipSeen(tip.id));
      const next = open.find((tip) => findTarget(tip.target));
      if (!next) return;
      window.clearInterval(timer);
      setCurrent({ tip: next, index: tips.length - open.length + 1, total: tips.length });
    }, 700);
    return () => { cancelled = true; window.clearInterval(timer); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key, round]);

  // Follow the control while scrolling or resizing; tapping it counts as seen.
  useEffect(() => {
    if (!current) return;
    let frame = 0;
    const follow = () => {
      const element = findTarget(current.tip.target);
      const next = !element || dialogOpen() ? null : element.getBoundingClientRect();
      // Only a real move renders again.
      const sig = next ? `${Math.round(next.top)},${Math.round(next.left)},${Math.round(next.width)},${Math.round(next.height)}` : '';
      if (sig !== lastBox.current) { lastBox.current = sig; setBox(next); }
      frame = window.requestAnimationFrame(follow);
    };
    follow();
    const onTap = (event: Event) => {
      const element = findTarget(current.tip.target);
      if (element && event.target instanceof Node && element.contains(event.target)) markTipSeen(current.tip.id);
    };
    document.addEventListener('pointerdown', onTap, true);
    return () => { window.cancelAnimationFrame(frame); document.removeEventListener('pointerdown', onTap, true); };
  }, [current]);

  if (!current || !box) return null;

  const done = () => { markTipSeen(current.tip.id); setCurrent(null); setRound((value) => value + 1); };
  const off = () => { setTipsOff(true); setCurrent(null); };
  const pad = 6;
  const width = Math.min(300, window.innerWidth - 32);
  // Beside a control in the desktop side bar, so the bubble covers none of its neighbours.
  const side = window.innerWidth >= 768 && box.right < 280 && box.right + pad + 14 + width < window.innerWidth;
  const below = box.bottom + 150 < window.innerHeight;
  const left = side ? box.right + pad + 14 : Math.max(16, Math.min(box.left + box.width / 2 - width / 2, window.innerWidth - width - 16));
  const arrow = Math.max(18, Math.min(box.left + box.width / 2 - left, width - 18));
  const place = side
    ? { top: Math.max(16, box.top + box.height / 2 - 28) }
    : below ? { top: box.bottom + pad + 12 } : { bottom: window.innerHeight - box.top + pad + 12 };
  const pointer = side
    ? { left: -7, top: Math.min(box.top + box.height / 2, window.innerHeight) - Math.max(16, box.top + box.height / 2 - 28) - 6, borderLeftWidth: 1, borderBottomWidth: 1 }
    : below ? { left: arrow - 6, top: -7, borderLeftWidth: 1, borderTopWidth: 1 } : { left: arrow - 6, bottom: -7, borderRightWidth: 1, borderBottomWidth: 1 };

  return (
    <div className="pointer-events-none fixed inset-0 z-[90]" aria-live="polite">
      {/* The control, cut out of the dimmed screen. */}
      <div
        className="tip-ring absolute rounded-2xl ring-2 ring-emerald-300 transition-all duration-300"
        style={{ top: box.top - pad, left: box.left - pad, width: box.width + pad * 2, height: box.height + pad * 2, boxShadow: '0 0 0 9999px rgba(2, 6, 23, 0.55)' }}
      />
      <div
        role="status"
        className="tip-bubble pointer-events-auto absolute rounded-2xl border border-emerald-300/40 bg-slate-900 p-4 text-white shadow-[0_20px_60px_rgba(0,0,0,0.55)]"
        style={{ width, left, ...place }}
      >
        <span aria-hidden className="absolute h-3 w-3 rotate-45 border-emerald-300/40 bg-slate-900" style={pointer} />
        <p className="text-sm font-bold leading-snug">{t(current.tip.text)}</p>
        <div className="mt-3 flex items-center justify-between gap-3">
          <button type="button" onClick={off} className="text-xs font-bold text-slate-400 underline">{t('tips.off')}</button>
          <div className="flex items-center gap-3">
            {current.total > 1 ? <span className="text-xs font-black tabular-nums text-slate-500">{current.index}/{current.total}</span> : null}
            <button type="button" onClick={done} className="rounded-xl bg-emerald-300 px-4 py-2 text-sm font-black text-slate-950">{t('tips.gotIt')}</button>
          </div>
        </div>
      </div>
    </div>
  );
}
