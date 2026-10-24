'use client';

/**
 * Profile photos in the app (0050): the round picture of a person (photo,
 * or the initials while there is none), the shrinking of a picked photo in
 * the browser, and the button to pick one.
 *
 * On the server the photos come through short-lived signed links; they are
 * fetched together for everyone shown at once and kept per person and
 * version, so lists do not flicker or ask again.
 */

import { useEffect, useRef, useState, type ReactNode } from 'react';

import { personPhotoLinks, useLocalDatabase, type Id, type Person } from '@/shared/data';
import { useT } from '@/shared/i18n';

const SIDE = 256;

/** A square JPEG of about 256 px from any picture the phone offers. */
export async function shrinkPhoto(file: Blob): Promise<Blob> {
  const bitmap = await createImageBitmap(file);
  const side = Math.min(bitmap.width, bitmap.height);
  const canvas = document.createElement('canvas');
  canvas.width = SIDE;
  canvas.height = SIDE;
  const context = canvas.getContext('2d');
  if (!context) throw new Error('No canvas.');
  context.drawImage(bitmap, (bitmap.width - side) / 2, (bitmap.height - side) / 2, side, side, 0, 0, SIDE, SIDE);
  bitmap.close?.();
  return new Promise((resolve, reject) => canvas.toBlob((blob) => (blob ? resolve(blob) : reject(new Error('No photo.'))), 'image/jpeg', 0.85));
}

// Links by `<person>:<photoAt>`; a new photo has a new key.
const links = new Map<string, string>();
const pending = new Map<string, Person>();
const listeners = new Set<() => void>();
let flushing: Promise<void> | null = null;

function keyOf(person: Person) {
  return `${person.id}:${person.photoAt}`;
}

function request(person: Person) {
  if (links.has(keyOf(person)) || pending.has(keyOf(person))) return;
  pending.set(keyOf(person), person);
  // Everyone asked for in the same moment goes in one request.
  flushing ??= Promise.resolve().then(async () => {
    const batch = [...pending.values()];
    pending.clear();
    flushing = null;
    try {
      const found = await personPhotoLinks(batch);
      for (const one of batch) {
        const link = found.get(one.id);
        if (link) links.set(keyOf(one), link);
      }
    } catch {
      // Offline or not allowed: the initials stay.
    }
    listeners.forEach((listener) => listener());
  });
}

/** The link to show this person's photo, or null (none yet, or not loaded). */
export function usePhotoUrl(person: Person | null | undefined): string | null {
  const [, rerender] = useState(0);
  useEffect(() => {
    const listener = () => rerender((value) => value + 1);
    listeners.add(listener);
    return () => { listeners.delete(listener); };
  }, []);
  useEffect(() => {
    if (person?.photoAt && !person.photo) request(person);
  }, [person]);
  if (!person?.photoAt) return null;
  return person.photo ?? links.get(keyOf(person)) ?? null;
}

function initials(name: string) {
  return name.split(/\s+/).filter(Boolean).slice(0, 2).map((part) => part[0]?.toUpperCase()).join('');
}

const SIZE = { sm: 'h-8 w-8 text-[11px]', md: 'h-10 w-10 text-xs', lg: 'h-20 w-20 text-xl' } as const;

/**
 * The person's round picture. `fallback` replaces the initials while there
 * is no photo (e.g. the status sign); `badge` sits on the photo's edge.
 */
export function PersonAvatar({ personId, name, size = 'md', fallback, badge, src }: { personId?: Id | null; name: string; size?: keyof typeof SIZE; fallback?: ReactNode; badge?: ReactNode; src?: string | null }) {
  const { database } = useLocalDatabase();
  const person = personId && database ? database.people.find((candidate) => candidate.id === personId) ?? null : null;
  const url = usePhotoUrl(person);
  const shown = src ?? url;
  if (!shown && fallback) return <>{fallback}</>;
  return (
    <span className={`relative grid shrink-0 place-items-center rounded-full bg-slate-800 font-black text-slate-200 ${SIZE[size]}`}>
      {shown ? (
        // eslint-disable-next-line @next/next/no-img-element -- signed links and data URLs, not optimisable
        <img src={shown} alt="" className="h-full w-full rounded-full object-cover" />
      ) : <span aria-hidden>{initials(name)}</span>}
      {shown && badge ? <span className="absolute -bottom-1 -right-1">{badge}</span> : null}
    </span>
  );
}

/** Pick a photo: shrinks it at once and hands over the small version. */
export function PhotoPicker({ name, src, onPick, onRemove, busy = false, hideAvatar = false }: { name: string; src: string | null; onPick: (photo: Blob) => void | Promise<void>; onRemove?: () => void | Promise<void>; busy?: boolean; hideAvatar?: boolean }) {
  const t = useT();
  const input = useRef<HTMLInputElement>(null);
  const [error, setError] = useState(false);
  return (
    <div className="flex items-center gap-4">
      {/* Next to a player card that shows the photo already, only the buttons. */}
      {hideAvatar ? null : <PersonAvatar name={name} size="lg" src={src} />}
      <div className="grid gap-1.5">
        <input
          ref={input}
          type="file"
          accept="image/*"
          className="hidden"
          onChange={async (event) => {
            const file = event.target.files?.[0];
            event.target.value = '';
            if (!file) return;
            setError(false);
            try { await onPick(await shrinkPhoto(file)); } catch { setError(true); }
          }}
        />
        <button type="button" disabled={busy} onClick={() => input.current?.click()} className="os-secondary justify-self-start px-4 py-2 text-sm disabled:opacity-60">
          {busy ? t('common.oneMoment') : src ? t('photo.change') : t('photo.add')}
        </button>
        {src && onRemove ? <button type="button" disabled={busy} onClick={() => void onRemove()} className="justify-self-start text-xs font-bold text-slate-400 underline">{t('photo.remove')}</button> : null}
        {error ? <p role="alert" className="text-xs font-bold text-red-200">{t('photo.error')}</p> : <p className="text-xs text-slate-500">{t('photo.hint')}</p>}
      </div>
    </div>
  );
}
