'use client';

/**
 * "Who are you?" for people new to Club OS (piece 8b): everyone has exactly
 * one way in, and this card says which one and where it comes from.
 *
 * - Players: the team's join link, QR code or code, from their coach.
 * - Coaches and staff: a personal invitation link from their Head Coach (a
 *   head coach of a new team gets it from the department lead). Personal,
 *   because it carries name and rights; an open code would hand out rights.
 * - Department leads: a personal link from the club admin.
 * - Founding a club: a one-time founding code from the Club OS team.
 *
 * A link opened directly skips all this; the card is for people who arrive
 * at the start page with a code, a pasted link, or nothing yet.
 */

import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { useT, type MessageKey } from '@/shared/i18n';

type Persona = 'player' | 'staff' | 'lead' | 'founder';

const PERSONAS: { id: Persona; label: MessageKey; hint: MessageKey }[] = [
  { id: 'player', label: 'onboarding.who.player', hint: 'onboarding.who.playerHint' },
  { id: 'staff', label: 'onboarding.who.staff', hint: 'onboarding.who.staffHint' },
  { id: 'lead', label: 'onboarding.who.lead', hint: 'onboarding.who.leadHint' },
  { id: 'founder', label: 'onboarding.who.founder', hint: 'onboarding.who.founderHint' },
];

const UUID = /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i;

/** The invitation token from a pasted link (or the bare token). */
export function inviteTokenFrom(text: string): string | null {
  return text.match(UUID)?.[0].toLowerCase() ?? null;
}

/** A join code from what was typed or pasted: the code itself, "ABCD-EFGH", or a whole join link. */
export function joinCodeFrom(text: string): string {
  const fromLink = text.match(/[?&]code=([A-Za-z0-9-]+)/)?.[1];
  return (fromLink ?? text).replace(/[^A-Za-z0-9]/g, '').toUpperCase();
}

const fieldClass = 'os-field min-w-0';

export function WhoAreYou({ signedIn = false }: { signedIn?: boolean }) {
  const t = useT();
  const router = useRouter();
  const [persona, setPersona] = useState<Persona | null>(null);
  const [value, setValue] = useState('');
  const [error, setError] = useState<string | null>(null);

  function pick(next: Persona) {
    setPersona((current) => (current === next ? null : next));
    setValue('');
    setError(null);
  }

  function submit(event: React.FormEvent) {
    event.preventDefault();
    if (persona === 'player') {
      const code = joinCodeFrom(value);
      if (code.length < 6) return setError(t('onboarding.who.errorJoinCode'));
      router.push(`/join?code=${encodeURIComponent(code)}`);
    } else if (persona === 'founder') {
      const code = value.replace(/[^A-Za-z0-9]/g, '').toUpperCase();
      if (code.length < 6) return setError(t('onboarding.who.errorFoundingCode'));
      router.push(`/found?code=${encodeURIComponent(code)}`);
    } else {
      const token = inviteTokenFrom(value);
      if (!token) return setError(t('onboarding.who.errorInvite'));
      router.push(`/join?invite=${token}`);
    }
  }

  const detail: Record<Persona, { text: string; field: string; placeholder: string; note?: string }> = {
    player: {
      text: t('onboarding.who.playerText'),
      field: t('onboarding.who.joinCode'),
      placeholder: 'ABCD-EFGH',
    },
    staff: {
      text: t('onboarding.who.staffText'),
      field: t('onboarding.who.inviteLink'),
      placeholder: 'https://…/join?invite=…',
      note: t('onboarding.who.staffNote'),
    },
    lead: {
      text: t('onboarding.who.leadText'),
      field: t('onboarding.who.inviteLink'),
      placeholder: 'https://…/join?invite=…',
      note: t('onboarding.who.leadNote'),
    },
    founder: {
      text: t('onboarding.who.founderText'),
      field: t('onboarding.who.foundingCode'),
      placeholder: 'ABCDE-FGHJK',
      note: t('onboarding.who.founderNote'),
    },
  };

  const current = persona ? detail[persona] : null;

  return (
    <section className="os-panel grid gap-4 p-5 sm:p-6">
      <div>
        <p className="text-lg font-black text-white">{signedIn ? t('onboarding.who.titleSignedIn') : t('onboarding.who.title')}</p>
        <p className="mt-1 text-sm text-slate-400">{t('onboarding.who.detail')}</p>
      </div>
      <div className="grid grid-cols-2 gap-2" role="group" aria-label={t('onboarding.who.groupLabel')}>
        {PERSONAS.map((entry) => (
          <button
            key={entry.id}
            type="button"
            onClick={() => pick(entry.id)}
            aria-pressed={persona === entry.id}
            className={`rounded-2xl border px-3 py-3 text-left transition ${
              persona === entry.id ? 'border-emerald-300 bg-emerald-300/10' : 'border-slate-700 bg-slate-950/60 hover:border-slate-500'
            }`}
          >
            <span className="block text-sm font-black text-white">{t(entry.label)}</span>
            <span className="block text-xs text-slate-400">{t(entry.hint)}</span>
          </button>
        ))}
      </div>
      {persona && current ? (
        <form onSubmit={submit} className="grid grid-cols-[minmax(0,1fr)] gap-3 rounded-2xl border border-slate-800 bg-slate-950/60 p-4">
          <p className="text-sm text-slate-300">{current.text}</p>
          <label className="grid gap-1 text-sm font-bold text-slate-200">
            {current.field}
            <input
              value={value}
              onChange={(event) => { setValue(event.target.value); setError(null); }}
              placeholder={current.placeholder}
              autoCapitalize={persona === 'player' || persona === 'founder' ? 'characters' : 'off'}
              autoComplete="off"
              spellCheck={false}
              className={`${fieldClass} ${persona === 'player' || persona === 'founder' ? 'font-mono tracking-[0.15em]' : ''}`}
            />
          </label>
          {error ? <p role="alert" className="text-sm font-bold text-red-200">{error}</p> : null}
          <button type="submit" className="os-success justify-center">{t('onboarding.who.continue')}</button>
          {current.note ? <p className="text-xs text-slate-400">{current.note}</p> : null}
        </form>
      ) : null}
    </section>
  );
}
