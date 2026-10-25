'use client';

/**
 * Team logos (0054): the round badge with the team's logo (or its initials),
 * and the picker for whoever configures or runs the team. A picked logo is
 * fitted whole into a transparent 256 px square, so crests keep their shape.
 */

import { useRef, useState } from 'react';

import { mayChangeTeamLogo, removeTeamLogo, setTeamLogo, teamLogoUrl, type LocalDatabase, type Team } from '@/shared/data';
import { errorText, useT } from '@/shared/i18n';

const SIDE = 256;

export async function shrinkLogo(file: Blob): Promise<Blob> {
  const bitmap = await createImageBitmap(file);
  const scale = Math.min(SIDE / bitmap.width, SIDE / bitmap.height, 1);
  const width = Math.round(bitmap.width * scale);
  const height = Math.round(bitmap.height * scale);
  const canvas = document.createElement('canvas');
  canvas.width = SIDE;
  canvas.height = SIDE;
  const context = canvas.getContext('2d');
  if (!context) throw new Error('No canvas.');
  context.drawImage(bitmap, (SIDE - width) / 2, (SIDE - height) / 2, width, height);
  bitmap.close?.();
  return new Promise((resolve, reject) => canvas.toBlob((blob) => (blob ? resolve(blob) : reject(new Error('No logo.'))), 'image/png'));
}

function initials(name: string) {
  return name.replace(/[^\p{L}\p{N} ]/gu, '').split(/\s+/).filter(Boolean).slice(0, 2).map((part) => part[0]?.toUpperCase()).join('');
}

export function TeamLogoBadge({ src, name, className = 'h-10 w-10 text-xs' }: { src: string | null; name: string; className?: string }) {
  return (
    <span className={`grid shrink-0 place-items-center overflow-hidden rounded-xl border border-slate-700 bg-slate-900 font-black text-slate-300 ${className}`}>
      {src ? (
        // eslint-disable-next-line @next/next/no-img-element -- public storage links and data URLs, not optimisable
        <img src={src} alt="" className="h-full w-full object-contain p-0.5" />
      ) : <span aria-hidden>{initials(name)}</span>}
    </span>
  );
}

/** Put in, change or remove the team's logo; nothing for who may not. */
export function TeamLogoPicker({ database, team, compact = false }: { database: LocalDatabase; team: Team; compact?: boolean }) {
  const t = useT();
  const input = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  if (!mayChangeTeamLogo(database, team.id)) return null;
  const src = teamLogoUrl(team);
  async function run(action: () => Promise<void>) {
    setBusy(true);
    setError(null);
    try { await action(); } catch (caught) { setError(errorText(t, caught)); } finally { setBusy(false); }
  }
  return (
    <div className="grid gap-1.5">
      <div className="flex items-center gap-3">
        <TeamLogoBadge src={src} name={team.name} className={compact ? 'h-10 w-10 text-xs' : 'h-14 w-14 text-sm'} />
        <div className="grid min-w-0 gap-1">
          {compact ? null : <p className="text-sm font-black text-white">{t('teamLogo.title')}</p>}
          <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
            <input
              ref={input}
              type="file"
              accept="image/*"
              className="hidden"
              onChange={(event) => {
                const file = event.target.files?.[0];
                event.target.value = '';
                if (file) void run(async () => setTeamLogo(team.id, await shrinkLogo(file)));
              }}
            />
            <button type="button" disabled={busy} onClick={() => input.current?.click()} className="text-xs font-black text-sky-300 underline disabled:opacity-60">
              {busy ? t('common.oneMoment') : src ? t('teamLogo.change') : t('teamLogo.add')}
            </button>
            {src && !busy ? <button type="button" onClick={() => void run(() => removeTeamLogo(team.id))} className="text-xs font-bold text-slate-400 underline">{t('teamLogo.remove')}</button> : null}
          </div>
          {compact ? null : <p className="text-xs text-slate-500">{t('teamLogo.hint')}</p>}
        </div>
      </div>
      {error ? <p role="alert" className="text-xs font-bold text-red-200">{error}</p> : null}
    </div>
  );
}
