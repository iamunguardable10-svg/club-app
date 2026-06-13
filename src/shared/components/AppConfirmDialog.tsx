'use client';

import { useBodyScrollLock } from '@/shared/hooks/useBodyScrollLock';

type AppConfirmDialogProps = {
  isOpen: boolean;
  title: string;
  description?: string;
  confirmLabel?: string;
  cancelLabel?: string;
  tone?: 'default' | 'danger';
  isConfirming?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
};

export function AppConfirmDialog({
  isOpen,
  title,
  description,
  confirmLabel = 'Confirm',
  cancelLabel = 'Cancel',
  tone = 'default',
  isConfirming = false,
  onConfirm,
  onCancel,
}: AppConfirmDialogProps) {
  useBodyScrollLock(isOpen);

  if (!isOpen) return null;

  const confirmClass =
    tone === 'danger'
      ? 'bg-red-400 text-slate-950 hover:bg-red-300'
      : 'bg-emerald-400 text-slate-950 hover:bg-emerald-300';

  return (
    <div className="fixed inset-0 z-[120] flex items-center justify-center bg-slate-950/80 px-4 backdrop-blur-sm" role="dialog" aria-modal="true">
      <div className="w-full max-w-md rounded-3xl border border-slate-700 bg-slate-950 p-5 shadow-2xl">
        <p className={tone === 'danger' ? 'text-xs font-black uppercase tracking-[0.18em] text-red-300' : 'text-xs font-black uppercase tracking-[0.18em] text-emerald-300'}>
          {tone === 'danger' ? 'Confirm deletion' : 'Confirm action'}
        </p>
        <h2 className="mt-3 text-2xl font-black text-white">{title}</h2>
        {description ? <p className="mt-3 text-sm font-bold leading-6 text-slate-300">{description}</p> : null}
        <div className="mt-5 grid gap-3 sm:grid-cols-2">
          <button
            type="button"
            onClick={onCancel}
            disabled={isConfirming}
            className="rounded-xl border border-slate-700 px-4 py-3 text-sm font-black text-slate-200 transition hover:bg-slate-900 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {cancelLabel}
          </button>
          <button
            type="button"
            onClick={onConfirm}
            disabled={isConfirming}
            className={`rounded-xl px-4 py-3 text-sm font-black transition disabled:cursor-not-allowed disabled:opacity-60 ${confirmClass}`}
          >
            {isConfirming ? 'Working...' : confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}
