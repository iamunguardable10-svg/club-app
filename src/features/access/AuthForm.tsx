'use client';

/**
 * Signing in and creating an account on the club server, e-mail first
 * (Ben, 2026-11-11: "like Trade Republic, less is more"): the address
 * alone, "Continue", then the server says whether it has an account (0055).
 * With one: its password. Without: a new password twice and the terms
 * (birth year and health data come with joining a team, where they matter). Forgotten passwords and
 * accounts still waiting for their confirmation mail are one tap away.
 *
 * Used on /login and inside onboarding (/join, /found). Signing in also
 * switches this device to the server; the page that follows loads fresh, so
 * nothing of the local test data is carried over.
 */

import { useId, useState } from 'react';

import { AcceptText, EMPTY_CONSENT, consentComplete } from '@/features/legal/ConsentFields';
import {
  emailAccountStatus,
  requestPasswordReset,
  resendConfirmation,
  setBackendChoice,
  signInWithPassword,
  signUpWithPassword,
  type AccessConsent,
  type EmailAccountStatus,
} from '@/shared/data';
import { currentLocale, errorText, useT } from '@/shared/i18n';

type Step = 'email' | 'password' | 'create' | 'reset';

export const MIN_PASSWORD = 8;

export function PasswordField({ label, value, onChange, show, onToggle, autoComplete, autoFocus = false }: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  show: boolean;
  onToggle?: () => void;
  autoComplete: string;
  autoFocus?: boolean;
}) {
  const t = useT();
  const id = useId();
  return (
    <div className="grid gap-1.5">
      <label htmlFor={id} className="text-sm font-bold text-slate-300">{label}</label>
      <span className="relative block">
        <input
          id={id}
          type={show ? 'text' : 'password'}
          autoComplete={autoComplete}
          autoFocus={autoFocus}
          required
          value={value}
          onChange={(event) => onChange(event.target.value)}
          className="os-field w-full pr-20 text-base"
        />
        {onToggle ? (
          <button type="button" onClick={onToggle} aria-pressed={show} className="absolute inset-y-0 right-2 my-auto h-8 rounded-lg px-2 text-xs font-black text-slate-300 hover:text-white">
            {show ? t('auth.hidePassword') : t('auth.showPassword')}
          </button>
        ) : null}
      </span>
    </div>
  );
}

export function PasswordCheck({ ok, label }: { ok: boolean; label: string }) {
  return (
    <li className={`flex items-center gap-2 text-xs font-bold ${ok ? 'text-emerald-300' : 'text-slate-500'}`}>
      <span aria-hidden className={`grid h-4 w-4 place-items-center rounded-full text-[10px] ${ok ? 'bg-emerald-300 text-slate-950' : 'border border-slate-600'}`}>{ok ? '✓' : ''}</span>
      {label}
    </li>
  );
}

export function AuthForm({
  returnTo,
  intro,
  staff = false,
  consent: givenConsent,
}: {
  /** Where to go after signing in, and where the confirmation mail leads back to. */
  returnTo: string;
  /** A line above the e-mail field, e.g. what the account is for. */
  intro?: string;
  staff?: boolean;
  /** Already given on the step before (with name and birth year): not asked again. */
  consent?: AccessConsent;
}) {
  const t = useT();
  const [ownConsent, setConsent] = useState(EMPTY_CONSENT);
  const consent = givenConsent ?? ownConsent;
  const [step, setStep] = useState<Step>('email');
  const [status, setStatus] = useState<EmailAccountStatus>('none');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [repeat, setRepeat] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [mailSent, setMailSent] = useState<{ to: string; kind: 'confirm' | 'reset' } | null>(null);

  const longEnough = password.length >= MIN_PASSWORD;
  const matches = password.length > 0 && password === repeat;

  function goTo(next: Step) {
    setStep(next);
    setError(null);
    setNotice(null);
    setPassword('');
    setRepeat('');
  }

  async function run(action: () => Promise<void>) {
    setBusy(true);
    setError(null);
    try { await action(); } catch (caught) { setError(errorText(t, caught)); }
    setBusy(false);
  }

  const submit = (event: React.FormEvent) => {
    event.preventDefault();
    void run(async () => {
      if (step === 'email') {
        const found = await emailAccountStatus(email);
        setStatus(found);
        goTo(found === 'none' ? 'create' : 'password');
      } else if (step === 'password') {
        await signInWithPassword(email, password);
        setBackendChoice('server');
        window.location.assign(returnTo);
      } else if (step === 'create') {
        const { confirmationNeeded } = await signUpWithPassword(email, password, returnTo, currentLocale(), consent);
        // The confirmation link comes back to this device in server mode.
        setBackendChoice('server');
        if (!confirmationNeeded) {
          window.location.assign(returnTo);
          return;
        }
        setMailSent({ to: email.trim(), kind: 'confirm' });
      } else {
        await requestPasswordReset(email, currentLocale());
        setMailSent({ to: email.trim(), kind: 'reset' });
      }
    });
  };

  if (mailSent) {
    return (
      <section className="wizard-step os-panel grid gap-3 p-6 text-sm text-slate-300">
        <span aria-hidden className="grid h-12 w-12 place-items-center rounded-2xl bg-emerald-300/15 text-2xl">✉</span>
        <p className="text-2xl font-black text-white">{t('auth.mail.title')}</p>
        <p>{t('auth.mail.sentTo', { email: mailSent.to })} {mailSent.kind === 'confirm' ? t('auth.mail.confirm') : t('auth.mail.reset')}</p>
        <button type="button" onClick={() => { setMailSent(null); goTo('email'); }} className="justify-self-start text-xs font-bold text-slate-400 underline">
          {t('auth.backToStart')}
        </button>
      </section>
    );
  }

  const title = step === 'email' ? t('auth.step.email') : step === 'password' ? t('auth.step.password') : step === 'create' ? t('auth.step.create') : t('auth.reset.title');
  // Less is more: only a line where the step is not obvious.
  const detail = step === 'email' ? intro ?? null : step === 'reset' ? t('auth.reset.detail') : null;
  const canSubmit = step === 'create' ? longEnough && matches && (givenConsent ? consentComplete(givenConsent, staff) : ownConsent.terms) : true;

  return (
    <form key={step} onSubmit={submit} className="wizard-step os-panel grid grid-cols-[minmax(0,1fr)] gap-5 p-6">
      <div>
        <h2 className="text-2xl font-black leading-tight text-white">{title}</h2>
        {detail ? <p className="mt-1.5 text-sm text-slate-400">{detail}</p> : null}
      </div>

      {step === 'email' ? (
        <input
          type="email"
          autoComplete="email"
          inputMode="email"
          autoFocus
          required
          value={email}
          onChange={(event) => setEmail(event.target.value)}
          placeholder={t('auth.emailPlaceholder')}
          aria-label={t('auth.email')}
          className="os-field text-lg"
        />
      ) : (
        <div className="flex items-center justify-between gap-3 rounded-2xl border border-slate-800 bg-slate-950/60 px-4 py-3">
          <span className="min-w-0 truncate text-sm font-bold text-slate-200">{email.trim()}</span>
          <button type="button" onClick={() => goTo('email')} className="shrink-0 text-xs font-black text-sky-300">{t('auth.changeEmail')}</button>
        </div>
      )}

      {step === 'password' && status === 'unconfirmed' ? (
        <div className="grid gap-2 rounded-2xl border border-amber-300/30 bg-amber-300/[0.06] p-3 text-sm text-amber-100">
          <p className="font-bold">{t('auth.unconfirmed')}</p>
          <button type="button" disabled={busy} onClick={() => void run(async () => { await resendConfirmation(email, returnTo); setNotice(t('auth.resent')); })} className="justify-self-start text-xs font-black text-amber-200 underline disabled:opacity-60">
            {t('auth.resend')}
          </button>
        </div>
      ) : null}

      {step === 'password' ? (
        <PasswordField label={t('auth.password')} value={password} onChange={setPassword} show={showPassword} onToggle={() => setShowPassword((value) => !value)} autoComplete="current-password" autoFocus />
      ) : null}

      {step === 'create' ? (
        <div className="grid gap-3">
          <PasswordField label={t('auth.choosePassword')} value={password} onChange={setPassword} show={showPassword} onToggle={() => setShowPassword((value) => !value)} autoComplete="new-password" autoFocus />
          <PasswordField label={t('auth.repeatPassword')} value={repeat} onChange={setRepeat} show={showPassword} autoComplete="new-password" />
          <ul className="grid gap-1">
            <PasswordCheck ok={longEnough} label={t('auth.check.length', { count: MIN_PASSWORD })} />
            <PasswordCheck ok={matches} label={t('auth.check.match')} />
          </ul>
          {/* Only the terms here; birth year and health data come with joining a team, where they matter. */}
          {givenConsent ? null : (
            <label className="flex items-start gap-3 text-sm text-slate-300">
              <input type="checkbox" required checked={ownConsent.terms} onChange={(event) => setConsent({ ...ownConsent, terms: event.target.checked })} className="mt-0.5 h-5 w-5 shrink-0" />
              <AcceptText />
            </label>
          )}
        </div>
      ) : null}

      {error ? <p role="alert" className="rounded-xl border border-red-500/45 bg-red-950/35 px-3 py-2 text-sm font-bold text-red-100">{error}</p> : null}
      {notice ? <p role="status" className="text-sm font-bold text-emerald-200">{notice}</p> : null}

      <button type="submit" disabled={busy || !canSubmit} className="os-success justify-center text-base disabled:opacity-50">
        {busy ? t('common.oneMoment') : step === 'email' ? t('common.continue') : step === 'password' ? t('auth.submit.signIn') : step === 'create' ? t('auth.submit.signUp') : t('auth.submit.reset')}
      </button>

      {step === 'password' ? (
        <div className="flex flex-wrap justify-between gap-2 text-xs font-bold text-slate-400">
          <button type="button" onClick={() => goTo('reset')} className="underline">{t('auth.forgotPassword')}</button>
          <button type="button" onClick={() => goTo('create')} className="underline">{t('auth.noAccountYet')}</button>
        </div>
      ) : null}
      {step === 'create' ? (
        <button type="button" onClick={() => { setStatus('confirmed'); goTo('password'); }} className="justify-self-start text-xs font-bold text-slate-400 underline">{t('auth.haveAccount')}</button>
      ) : null}
      {step === 'reset' ? (
        <button type="button" onClick={() => goTo('password')} className="justify-self-start text-xs font-bold text-slate-400 underline">{t('auth.backToSignIn')}</button>
      ) : null}
    </form>
  );
}
