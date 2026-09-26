'use client';

/**
 * "Report a problem" (piece 13): a few words from the person, plus where it
 * happened. What is sent along is shown, so nobody wonders.
 */

import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';

import { useBodyScrollLock } from '@/shared/hooks/useBodyScrollLock';

import { errorText, useT, type MessageKey } from '@/shared/i18n';
import { reportContext, reportProblem } from './errorReporting';

const ROLE_LABEL = { coach: 'report.role.coach', athlete: 'report.role.athlete', club: 'report.role.club' } as const satisfies Record<string, MessageKey>;

export function ReportProblemDialog({ isOpen, onClose, prefill = '' }: { isOpen: boolean; onClose: () => void; prefill?: string }) {
  const t = useT();
  useBodyScrollLock(isOpen);
  const [text, setText] = useState(prefill);
  const [state, setState] = useState<'idle' | 'sending' | 'sent'>('idle');
  const [error, setError] = useState<string | null>(null);
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);

  // Into document.body: the account button sits in a header with
  // backdrop-blur, which would pin a fixed overlay to the header instead of
  // the screen (same as the account sheet).
  if (!isOpen || !mounted) return null;
  const context = reportContext();

  function close() {
    setText(prefill);
    setState('idle');
    setError(null);
    onClose();
  }

  async function send() {
    setState('sending');
    setError(null);
    try {
      await reportProblem(text);
      setState('sent');
    } catch (caught) {
      setError(errorText(t, caught));
      setState('idle');
    }
  }

  return createPortal(
    <div className="fixed inset-0 z-[120] flex items-end justify-center bg-slate-950/80 p-3 backdrop-blur-sm sm:items-center" role="dialog" aria-modal="true" aria-labelledby="report-title">
      <div className="w-full max-w-md rounded-3xl border border-slate-700 bg-slate-950 p-5 text-white shadow-2xl">
        <p className="text-xs font-black uppercase tracking-[0.18em] text-sky-300">{t('report.kicker')}</p>
        <h2 id="report-title" className="mt-1 text-xl font-black">{t('report.title')}</h2>
        {state === 'sent' ? (
          <div className="mt-4 grid gap-4">
            <p className="text-sm text-slate-300">{t('report.thanks')}</p>
            <button type="button" onClick={close} className="os-success justify-center px-4 py-2 text-sm">{t('report.close')}</button>
          </div>
        ) : (
          <form className="mt-4 grid gap-3" onSubmit={(event) => { event.preventDefault(); void send(); }}>
            <label className="grid gap-1.5 text-sm font-bold text-slate-300">
              {t('report.question')}
              <textarea
                value={text}
                onChange={(event) => { setText(event.target.value); setError(null); }}
                maxLength={4000}
                rows={5}
                autoFocus
                placeholder={t('report.placeholder')}
                className="os-field min-h-28 resize-y"
              />
            </label>
            <p className="text-xs text-slate-500">
              {t('report.sentAlong', {
                page: context.page || '/',
                role: context.role ? ` · ${t(ROLE_LABEL[context.role])}` : '',
                mode: context.mode === 'demo' ? t('report.modeDemo') : t('report.modeAccount'),
                device: context.device,
                version: context.version,
              })}
            </p>
            {error ? <p role="alert" className="text-xs font-bold text-red-200">{error}</p> : null}
            <div className="flex flex-wrap gap-2">
              <button type="submit" disabled={state === 'sending' || text.trim().length < 3} className="os-success justify-center px-4 py-2 text-sm disabled:opacity-60">
                {state === 'sending' ? t('report.sending') : t('report.send')}
              </button>
              <button type="button" onClick={close} className="rounded-2xl border border-slate-700 px-4 py-2 text-sm font-black text-slate-300">{t('report.cancel')}</button>
            </div>
          </form>
        )}
      </div>
    </div>,
    document.body,
  );
}
