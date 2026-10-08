'use client';

import Image from 'next/image';
import Link from 'next/link';
import { useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { hasSignedInAccount, isServerAvailable } from '@/shared/data';
import { isStandalone } from '@/features/install/installPrompt';
import { useT, type MessageKey } from '@/shared/i18n';
import { LanguagePicker } from '@/shared/i18n/LanguagePicker';
import './landing.css';

const roles = [
  { id: 'coach', key: 'landing.coach' },
  { id: 'athlete', key: 'landing.player' },
  { id: 'club', key: 'landing.club' },
] as const;
const audiences = [
  { title: 'landing.leads.title', body: 'landing.leads.body', icon: 'structure' },
  { title: 'landing.coaches.title', body: 'landing.coaches.body', icon: 'calendar' },
  { title: 'landing.players.title', body: 'landing.players.body', icon: 'check' },
] as const;
const features: { title: MessageKey; body: MessageKey; tag: MessageKey; image: string; alt: MessageKey; extra?: string; extraAlt?: MessageKey }[] = [
  { title: 'landing.calendar.title', body: 'landing.calendar.body', tag: 'landing.calendar.tag', image: 'calendar', alt: 'landing.calendar.alt', extra: 'halls', extraAlt: 'landing.halls.alt' },
  { title: 'landing.rsvp.title', body: 'landing.rsvp.body', tag: 'landing.rsvp.tag', image: 'game', alt: 'landing.game.alt' },
  { title: 'landing.messages.title', body: 'landing.messages.body', tag: 'landing.messages.tag', image: 'messages', alt: 'landing.messages.alt' },
  { title: 'landing.carpools.title', body: 'landing.carpools.body', tag: 'landing.carpools.tag', image: 'carpools', alt: 'landing.carpools.alt' },
  { title: 'landing.load.title', body: 'landing.load.body', tag: 'landing.load.tag', image: 'load', alt: 'landing.load.alt' },
];
const faqs: { q: MessageKey; a: MessageKey }[] = [
  { q: 'landing.faq.cost.q', a: 'landing.faq.cost.a' },
  { q: 'landing.faq.data.q', a: 'landing.faq.data.a' },
  { q: 'landing.faq.minors.q', a: 'landing.faq.minors.a' },
  { q: 'landing.faq.sports.q', a: 'landing.faq.sports.a' },
  { q: 'landing.faq.install.q', a: 'landing.faq.install.a' },
  { q: 'landing.faq.start.q', a: 'landing.faq.start.a' },
];

function Icon({ kind }: { kind: string }) {
  return <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    {kind === 'calendar' ? <><rect x="3" y="5" width="18" height="16" rx="3" /><path d="M7 3v4m10-4v4M3 11h18m-13 5h3" /></> : kind === 'structure' ? <><rect x="8" y="3" width="8" height="5" rx="1" /><path d="M12 8v5M5 16v-3h14v3" /><rect x="2" y="16" width="6" height="5" rx="1" /><rect x="16" y="16" width="6" height="5" rx="1" /></> : kind === 'signal' ? <><path d="M3 9a15 15 0 0 1 18 0M6 13a10 10 0 0 1 12 0m-9 4a5 5 0 0 1 6 0" /><circle cx="12" cy="21" r=".5" /></> : <><rect x="3" y="3" width="18" height="18" rx="6" /><path d="m8 12 3 3 5-6" /></>}
  </svg>;
}

function Phone({ shot, alt, priority = false, className = '' }: { shot: string; alt: string; priority?: boolean; className?: string }) {
  return <div className={`marketing-phone ${className}`}>
    <div className="phone-camera" aria-hidden="true" />
    <Image src={`/landing/${shot}.webp`} alt={alt} width={780} height={1688} sizes="(max-width: 700px) 230px, 300px" priority={priority} />
    <div className="phone-home" aria-hidden="true" />
  </div>;
}

export function LandingPage() {
  const t = useT();
  const router = useRouter();
  const [visible, setVisible] = useState(false);
  const [role, setRole] = useState<(typeof roles)[number]['id']>('coach');
  const root = useRef<HTMLDivElement>(null);
  const pilot = `mailto:ben.hebling@gmx.de?subject=${encodeURIComponent(t('landing.mail.subject'))}&body=${encodeURIComponent(t('landing.mail.body'))}`;

  useEffect(() => {
    let active = true;
    if (isStandalone()) { router.replace('/start'); return; }
    void (async () => {
      const signedIn = isServerAvailable() && await hasSignedInAccount().catch(() => false);
      if (!active) return;
      if (signedIn) router.replace('/start');
      else setVisible(true);
    })();
    return () => { active = false; };
  }, [router]);

  useEffect(() => {
    if (!visible || !root.current || window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    const observer = new IntersectionObserver((entries) => {
      for (const entry of entries) {
        if (entry.isIntersecting) { entry.target.classList.add('revealed'); observer.unobserve(entry.target); }
      }
    }, { threshold: 0.08 });
    root.current.querySelectorAll('[data-reveal]').forEach((element) => observer.observe(element));
    root.current.classList.add('motion-ready');
    return () => observer.disconnect();
  }, [visible]);

  return <div ref={root} className={`marketing ${visible ? 'marketing-ready' : 'marketing-pending'}`}>
    <noscript><style>{'.marketing-pending { visibility: visible; }'}</style></noscript>
    <a href="#main" className="marketing-skip">{t('landing.skip')}</a>
    <header className="marketing-nav wrap">
      <Link href="/" className="marketing-brand" aria-label="Club OS"><span className="brand-mark" aria-hidden="true"><span /><span /><span /></span>Club OS<span className="brand-beta">{t('landing.pilotBadge')}</span></Link>
      <nav aria-label={t('landing.navigation')}><a href="#features" className="nav-features">{t('landing.features')}</a><Link href="/start" className="nav-signin">{t('landing.signIn')} <span aria-hidden="true">↗</span></Link></nav>
    </header>
    <main id="main">
      <section className="marketing-hero wrap">
        <div className="hero-copy">
          <a href="#pilot" className="hero-eyebrow"><span className="live-dot" />{t('landing.eyebrow')}<span aria-hidden="true">↗</span></a>
          <h1>{t('landing.headline.first')}<br /><span>{t('landing.headline.second')}</span></h1>
          <p className="hero-subline">{t('landing.subline')}</p>
          <div className="hero-actions"><Link className="marketing-button primary" href={`/start?demo=${role}`}>{t('landing.demo')}<span aria-hidden="true">↗</span></Link><a className="marketing-button secondary" href={pilot}>{t('landing.requestPilot')}</a></div>
          <div className="demo-roles" role="group" aria-label={t('landing.demoRole')}><span>{t('landing.exploreAs')}</span>{roles.map((item) => <button key={item.id} type="button" aria-pressed={role === item.id} onClick={() => setRole(item.id)}>{t(item.key)}</button>)}</div>
          <p className="hero-note">{t('landing.noAccount')} <Link href="/start">{t('landing.signIn')} <span aria-hidden="true">↗</span></Link></p>
        </div>
        <div className="hero-visual" aria-label={t('landing.visualLabel')}>
          <div className="hero-orbit" aria-hidden="true" />
          <Phone shot="today" alt={t('landing.today.alt')} className="hero-phone left" priority />
          <Phone shot="load" alt={t('landing.load.alt')} className="hero-phone right" priority />
          <Phone shot="calendar" alt={t('landing.calendar.alt')} className="hero-phone center" priority />
          <span className="visual-caption"><span className="live-dot" />{t('landing.realScreens')}</span>
        </div>
      </section>
      <section className="pain-strip wrap" aria-label={t('landing.promise')}>
        <div className="pain-before"><span>{t('landing.pain.whatsapp')}</span><span>{t('landing.pain.excel')}</span><span>{t('landing.pain.rsvp')}</span></div>
        <span className="pain-arrow" aria-hidden="true">→</span><p><span className="live-dot" />{t('landing.promise')}</p>
      </section>
      <section className="audience-section wrap" data-reveal>
        <div className="section-heading"><p className="marketing-kicker">{t('landing.audience.kicker')}</p><h2>{t('landing.audience.title')}</h2><p>{t('landing.audience.subline')}</p></div>
        <div className="audience-grid">{audiences.map((item) => <article key={item.title} className="audience-card"><div className="marketing-icon"><Icon kind={item.icon} /></div><h3>{t(item.title)}</h3><p>{t(item.body)}</p></article>)}</div>
      </section>
      <section id="features" className="features-section wrap">
        <div className="section-heading" data-reveal><p className="marketing-kicker">{t('landing.features.kicker')}</p><h2>{t('landing.features.title')}</h2></div>
        {features.map((feature, index) => <article key={feature.title} className={`feature-story ${index % 2 ? 'reverse' : ''}`} data-reveal>
          <div className="feature-copy"><p className="marketing-kicker">{t(feature.tag)}</p><h3>{t(feature.title)}</h3><p>{t(feature.body)}</p><Link href="/start?demo=coach" className="feature-link">{t('landing.seeDemo')} <span aria-hidden="true">↗</span></Link></div>
          <div className={`feature-visual feature-${feature.image}`}><div className="feature-grid" aria-hidden="true" />{feature.extra && feature.extraAlt ? <Phone shot={feature.extra} alt={t(feature.extraAlt)} className="feature-extra" /> : null}<Phone shot={feature.image} alt={t(feature.alt)} /></div>
        </article>)}
        <div className="essentials-grid" data-reveal><article><div className="marketing-icon"><Icon kind="signal" /></div><h3>{t('landing.offline.title')}</h3><p>{t('landing.offline.body')}</p></article><article><div className="language-glyph" aria-hidden="true">Aa</div><h3>{t('landing.languages.title')}</h3><p>{t('landing.languages.body')}</p></article></div>
      </section>
      <section className="trust-section wrap" data-reveal><div className="section-heading"><p className="marketing-kicker">{t('landing.trust.kicker')}</p><h2>{t('landing.trust.title')}</h2></div><div className="trust-grid">{(['landing.trust.eu', 'landing.trust.ads', 'landing.trust.consent', 'landing.trust.install'] as const).map((key) => <p key={key}><span aria-hidden="true">✓</span>{t(key)}</p>)}</div><Link href="/privacy" className="feature-link">{t('landing.privacy')} <span aria-hidden="true">↗</span></Link></section>
      <section id="pilot" className="pilot-section wrap" data-reveal><div className="pilot-panel"><div><p className="marketing-kicker">{t('landing.pilot.kicker')}</p><h2>{t('landing.pilot.title')}</h2><p>{t('landing.pilot.body')}</p><a href={pilot} className="marketing-button primary">{t('landing.requestPilot')} <span aria-hidden="true">↗</span></a></div><ul>{(['landing.pilot.setup', 'landing.pilot.direct', 'landing.pilot.shape'] as const).map((key) => <li key={key}><span aria-hidden="true">↗</span>{t(key)}</li>)}</ul></div></section>
      <section className="faq-section wrap" data-reveal><div className="section-heading"><p className="marketing-kicker">{t('landing.faq.kicker')}</p><h2>{t('landing.faq.title')}</h2></div><div className="faq-list">{faqs.map((faq) => <details key={faq.q}><summary>{t(faq.q)}<span aria-hidden="true">+</span></summary><p>{t(faq.a)}</p></details>)}</div></section>
      <section className="final-section wrap" data-reveal><p className="marketing-kicker">{t('landing.final.kicker')}</p><h2>{t('landing.final.title')}</h2><div className="hero-actions"><a href={pilot} className="marketing-button primary">{t('landing.requestPilot')} <span aria-hidden="true">↗</span></a><Link href="/start?demo=coach" className="marketing-button secondary">{t('landing.demo')}</Link></div></section>
    </main>
    <footer className="marketing-footer wrap"><div className="footer-top"><Link href="/" className="marketing-brand"><span className="brand-mark" aria-hidden="true"><span /><span /><span /></span>Club OS</Link><LanguagePicker compact /></div><div className="footer-bottom"><p>{t('landing.copyright')}</p><nav aria-label={t('landing.legal')}><Link href="/imprint">{t('landing.imprint')}</Link><Link href="/privacy">{t('landing.privacy')}</Link><a href="mailto:ben.hebling@gmx.de">{t('landing.contact')}</a><Link href="/start">{t('landing.signIn')}</Link></nav></div></footer>
  </div>;
}
