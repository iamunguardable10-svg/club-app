'use client';

/**
 * Scanning the coach's team QR code inside the app (Ben, 2026-11-22): a link
 * or QR code opened outside always lands in the browser on an iPhone, so the
 * app on the home screen brings its own camera. The phone asks for the camera
 * once; then the code is read live and the way in goes on in the app.
 *
 * - Reads with the built-in BarcodeDetector where there is one (Android),
 *   otherwise with jsQR, loaded only when the scanner opens.
 * - `accept` turns a read text into where to go, or null for "not a team
 *   code" (the scanner keeps looking).
 * - Full screen over everything, closes with "Close" or Escape; the camera
 *   stops as soon as it closes.
 */

import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';

import { useT, type MessageKey } from '@/shared/i18n';

type Problem = 'denied' | 'noCamera' | 'unsupported';

type Detector = { detect: (source: CanvasImageSource) => Promise<{ rawValue: string }[]> };

/** The built-in reader, if this browser has one for QR codes. */
async function builtInDetector(): Promise<Detector | null> {
  const Native = (globalThis as { BarcodeDetector?: { new (options: { formats: string[] }): Detector; getSupportedFormats?: () => Promise<string[]> } }).BarcodeDetector;
  if (!Native) return null;
  try {
    const formats = (await Native.getSupportedFormats?.()) ?? ['qr_code'];
    return formats.includes('qr_code') ? new Native({ formats: ['qr_code'] }) : null;
  } catch {
    return null;
  }
}

const PROBLEM_TEXT: Record<Problem, MessageKey> = {
  denied: 'scan.denied',
  noCamera: 'scan.noCamera',
  unsupported: 'scan.unsupported',
};

export function QrScanner({ accept, onResult, onClose }: { accept: (text: string) => string | null; onResult: (target: string) => void; onClose: () => void }) {
  const t = useT();
  const video = useRef<HTMLVideoElement>(null);
  const [problem, setProblem] = useState<Problem | null>(null);
  const [ready, setReady] = useState(false);
  const [notTeam, setNotTeam] = useState(false);

  useEffect(() => {
    let stream: MediaStream | null = null;
    let stopped = false;
    let frame = 0;
    let last = 0;
    let wrongUntil = 0;
    const canvas = document.createElement('canvas');
    const context = canvas.getContext('2d', { willReadFrequently: true });

    async function start() {
      if (!navigator.mediaDevices?.getUserMedia) return setProblem('unsupported');
      try {
        stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: { ideal: 'environment' } }, audio: false });
      } catch (error) {
        const name = (error as { name?: string }).name;
        return setProblem(name === 'NotAllowedError' || name === 'SecurityError' ? 'denied' : name === 'NotFoundError' || name === 'OverconstrainedError' ? 'noCamera' : 'unsupported');
      }
      if (stopped || !video.current) { stream.getTracks().forEach((track) => track.stop()); return; }
      video.current.srcObject = stream;
      await video.current.play().catch(() => undefined);
      setReady(true);
      const detector = await builtInDetector();
      const jsQR = detector ? null : (await import('jsqr')).default;

      const read = async (): Promise<string | null> => {
        const element = video.current;
        if (!element || element.readyState < 2 || !element.videoWidth) return null;
        if (detector) return (await detector.detect(element).catch(() => []))[0]?.rawValue ?? null;
        if (!context || !jsQR) return null;
        const scale = Math.min(1, 640 / element.videoWidth);
        canvas.width = Math.round(element.videoWidth * scale);
        canvas.height = Math.round(element.videoHeight * scale);
        context.drawImage(element, 0, 0, canvas.width, canvas.height);
        const image = context.getImageData(0, 0, canvas.width, canvas.height);
        return jsQR(image.data, image.width, image.height, { inversionAttempts: 'dontInvert' })?.data ?? null;
      };

      const tick = async (now: number) => {
        if (stopped) return;
        if (now - last > 150) {
          last = now;
          const text = await read();
          if (stopped) return;
          if (text) {
            const target = accept(text);
            if (target) {
              stopped = true;
              stream?.getTracks().forEach((track) => track.stop());
              navigator.vibrate?.(40);
              onResult(target);
              return;
            }
            wrongUntil = now + 2500;
            setNotTeam(true);
          } else if (now > wrongUntil) setNotTeam(false);
        }
        frame = requestAnimationFrame((time) => void tick(time));
      };
      frame = requestAnimationFrame((time) => void tick(time));
    }

    void start();
    return () => {
      stopped = true;
      cancelAnimationFrame(frame);
      stream?.getTracks().forEach((track) => track.stop());
    };
  // The scanner opens once; `accept` and `onResult` are read when a code is found.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    const previous = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    const onKey = (event: KeyboardEvent) => { if (event.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    return () => { document.body.style.overflow = previous; window.removeEventListener('keydown', onKey); };
  }, [onClose]);

  // On the page itself: a moving card around the button would shift a fixed layer.
  return createPortal(
    <div role="dialog" aria-modal="true" aria-label={t('scan.title')} className="fixed inset-0 z-[300] bg-black text-white" data-testid="qr-scanner">
      <video ref={video} playsInline muted autoPlay className={`absolute inset-0 h-full w-full object-cover transition-opacity duration-300 ${ready ? 'opacity-100' : 'opacity-0'}`} />

      {problem ? null : (
        <div aria-hidden className="pointer-events-none absolute inset-0 grid place-items-center">
          {/* The frame: everything around it darker, four bright corners. */}
          <div className="relative h-64 w-64 rounded-[2rem] shadow-[0_0_0_200vmax_rgba(5,8,12,0.62)]">
            <span className="absolute -left-0.5 -top-0.5 h-12 w-12 rounded-tl-[2rem] border-l-4 border-t-4 border-emerald-300" />
            <span className="absolute -right-0.5 -top-0.5 h-12 w-12 rounded-tr-[2rem] border-r-4 border-t-4 border-emerald-300" />
            <span className="absolute -bottom-0.5 -left-0.5 h-12 w-12 rounded-bl-[2rem] border-b-4 border-l-4 border-emerald-300" />
            <span className="absolute -bottom-0.5 -right-0.5 h-12 w-12 rounded-br-[2rem] border-b-4 border-r-4 border-emerald-300" />
            {ready ? <span className="os-scan-line absolute inset-x-6 top-6 h-0.5 rounded-full bg-emerald-300/80 shadow-[0_0_12px_rgba(110,231,183,0.9)]" /> : null}
          </div>
        </div>
      )}

      <div className="absolute inset-x-0 top-0 flex items-center justify-between gap-3 px-4 pb-3 pt-[calc(env(safe-area-inset-top)+0.75rem)]">
        <p className="text-lg font-semibold">{t('scan.title')}</p>
        <button type="button" onClick={onClose} className="rounded-full bg-white/15 px-4 py-2 text-sm font-semibold backdrop-blur">{t('scan.close')}</button>
      </div>

      <div className="absolute inset-x-0 bottom-0 grid justify-items-center gap-3 px-6 pb-[calc(env(safe-area-inset-bottom)+2rem)] pt-4 text-center">
        {problem ? (
          <div className="os-panel grid max-w-sm gap-3 p-5 text-left text-sm text-slate-300">
            <p role="alert" className="text-base font-semibold text-white">{t(PROBLEM_TEXT[problem])}</p>
            <button type="button" onClick={onClose} className="os-success justify-center">{t('scan.typeCode')}</button>
          </div>
        ) : (
          <p role="status" className={`max-w-xs rounded-full px-4 py-2 text-sm font-semibold backdrop-blur ${notTeam ? 'bg-amber-300 text-slate-950' : 'bg-black/45 text-white'}`}>
            {notTeam ? t('scan.notTeam') : ready ? t('scan.hint') : t('scan.starting')}
          </p>
        )}
      </div>
    </div>,
    document.body,
  );
}

/** The camera button above a code field. */
export function ScanButton({ onClick }: { onClick: () => void }) {
  const t = useT();
  return (
    <button type="button" onClick={onClick} className="os-secondary flex items-center justify-center gap-2.5 text-base">
      <svg aria-hidden viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <path d="M3 7V5a2 2 0 0 1 2-2h2M17 3h2a2 2 0 0 1 2 2v2M21 17v2a2 2 0 0 1-2 2h-2M7 21H5a2 2 0 0 1-2-2v-2" />
        <rect x="7" y="7" width="4" height="4" rx="0.5" /><rect x="13" y="7" width="4" height="4" rx="0.5" /><rect x="7" y="13" width="4" height="4" rx="0.5" /><path d="M13 13h4v4" />
      </svg>
      {t('scan.button')}
    </button>
  );
}

/** Where a scanned team QR code (or invitation) leads, or null. */
export function joinTargetFrom(text: string, joinCodeFrom: (text: string) => string, inviteTokenFrom: (text: string) => string | null): string | null {
  // A link must be one of ours, to the way in: other QR codes are not followed.
  if (/^https?:\/\//i.test(text.trim())) {
    try {
      const url = new URL(text.trim());
      const ours = url.host === window.location.host || url.hostname === 'clubos.hebinova.de';
      if (!ours || url.pathname !== '/join') return null;
    } catch {
      return null;
    }
  }
  if (/[?&]invite=/.test(text)) {
    const token = inviteTokenFrom(text);
    return token ? `/join?invite=${token}` : null;
  }
  const looksLikeOurs = /[?&]code=/.test(text) || /^[A-Za-z0-9-]{6,12}$/.test(text.trim());
  const code = looksLikeOurs ? joinCodeFrom(text) : '';
  return code.length >= 6 ? `/join?code=${encodeURIComponent(code)}` : null;
}
