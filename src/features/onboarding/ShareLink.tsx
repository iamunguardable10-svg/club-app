'use client';

/**
 * A link to hand over: the phone's share menu (WhatsApp, mail, …) where there
 * is one, copying otherwise, and on request a QR code to show in the hall.
 * On plain http (no clipboard API) the link stays visible to copy by hand.
 */

import { useEffect, useState } from 'react';
import { useT } from '@/shared/i18n';

const buttonClass = 'shrink-0 rounded-lg border px-2 py-1.5 text-[11px] font-black transition';

export function ShareLink({ label, url, shareText, qr = false }: { label: string; url: string; shareText?: string; qr?: boolean }) {
  const t = useT();
  const [copied, setCopied] = useState(false);
  const [canShare, setCanShare] = useState(false);
  const [showQr, setShowQr] = useState(false);
  useEffect(() => setCanShare(typeof navigator !== 'undefined' && typeof navigator.share === 'function'), []);

  return (
    <div className="grid gap-2">
      <div className="flex items-center gap-2">
        <input readOnly value={url} aria-label={label} onFocus={(event) => event.currentTarget.select()} className="min-w-0 flex-1 rounded-lg border border-slate-800 bg-slate-950 px-2 py-1.5 font-mono text-[11px] text-slate-300" />
        <button
          type="button"
          onClick={() => navigator.clipboard?.writeText(url).then(() => setCopied(true)).catch(() => undefined)}
          className={`${buttonClass} border-sky-500/50 text-sky-100`}
        >
          {copied ? t('share.copied') : t('share.copy')}
        </button>
        {canShare ? (
          <button
            type="button"
            // Closing the share menu without picking anything rejects; that is fine.
            onClick={() => navigator.share({ title: 'Club OS', text: shareText, url }).catch(() => undefined)}
            className={`${buttonClass} border-emerald-400/50 text-emerald-100`}
          >
            {t('share.share')}
          </button>
        ) : null}
        {qr ? (
          <button type="button" onClick={() => setShowQr((value) => !value)} aria-expanded={showQr} className={`${buttonClass} border-slate-600 text-slate-200`}>
            {t('share.qr')}
          </button>
        ) : null}
      </div>
      {qr && showQr ? <QrCode value={url} label={label} /> : null}
    </div>
  );
}

/** The library is only loaded when a code is actually shown. */
function QrCode({ value, label }: { value: string; label: string }) {
  const t = useT();
  const [svg, setSvg] = useState<string | null>(null);
  useEffect(() => {
    let cancelled = false;
    import('qrcode')
      // CommonJS package: its functions sit on `default` or on the module itself.
      .then((module) => (module.default ?? module).toString(value, { type: 'svg', margin: 2, errorCorrectionLevel: 'M' }))
      .then((markup) => { if (!cancelled) setSvg(markup); })
      .catch(() => { if (!cancelled) setSvg(null); });
    return () => { cancelled = true; };
  }, [value]);
  return (
    <div className="grid justify-items-center gap-2 rounded-xl bg-white p-4">
      {svg ? (
        // Generated locally from our own URL, not user HTML.
        <div role="img" aria-label={t('share.qrLabel', { label })} className="h-56 w-56 [&>svg]:h-full [&>svg]:w-full" dangerouslySetInnerHTML={{ __html: svg }} />
      ) : (
        <div className="grid h-56 w-56 place-items-center text-xs font-bold text-slate-500">{t('share.creatingQr')}</div>
      )}
      <p className="text-center text-xs font-bold text-slate-700">{t('share.scan')}</p>
    </div>
  );
}
