import type { Metadata } from 'next';
import Link from 'next/link';
import type { ReactNode } from 'react';

export const metadata: Metadata = { title: 'Your data · Club OS' };

/**
 * How Club OS handles people's data, in plain words (2026-09-26). A pilot
 * summary, not a full privacy policy: what is stored, who sees it, where it
 * lives, and how to delete it.
 */

function Part({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="os-panel grid gap-2 p-5 text-sm leading-relaxed text-slate-300">
      <h2 className="text-base font-black text-white">{title}</h2>
      {children}
    </section>
  );
}

export default function PrivacyPage() {
  return (
    <main className="os-page">
      <div className="os-container max-w-2xl space-y-4">
        <header className="os-hero p-6">
          <p className="os-kicker">Club OS</p>
          <h1 className="os-title mt-2">Your data</h1>
          <p className="os-copy mt-3">
            Club OS is run for your club as a pilot. This page says in plain words what it keeps, who sees it and how to delete it.
            No ads, no tracking, nothing is sold.
          </p>
        </header>

        <Part title="What Club OS keeps">
          <ul className="grid list-disc gap-1 pl-5">
            <li>Your account: email address and password (stored only as a secure hash).</li>
            <li>Your name, your teams and your roles.</li>
            <li>Your answers to sessions (in, out, late, with a reason if you give one) and absences.</li>
            <li>For teams that track load: how hard a session was (RPE) and how long, and your own training plans.</li>
            <li>Settings: notifications, quiet hours, the devices that get notifications, your calendar link.</li>
            <li>If you connect Apple Calendar: your Apple ID and the app-specific password (encrypted), and appointments from calendars you chose to show.</li>
            <li>Error reports when something breaks, so it can be fixed.</li>
          </ul>
        </Part>

        <Part title="Who sees it">
          <ul className="grid list-disc gap-1 pl-5">
            <li>Your coaches see your answers and absences (the reasons only coaches allowed to), and, where load is tracked, your load and own training.</li>
            <li>Other players see the team’s sessions, messages and coaches, but not you: not your name, answers, absences or load.</li>
            <li>Club admins and department leads see who is in which team.</li>
            <li>Appointments from your own Apple calendars: only you.</li>
            <li>Nobody outside your club.</li>
          </ul>
        </Part>

        <Part title="Where it lives">
          <p>
            The data is stored with Supabase in the EU (Paris, France). The app itself is served by Vercel. Notifications go
            through Apple’s or Google’s push service to your phone. If you connect Apple Calendar, your sessions are written to
            your iCloud.
          </p>
        </Part>

        <Part title="Under 16">
          <p>Please ask a parent before you create an account.</p>
        </Part>

        <Part title="Your choices">
          <ul className="grid list-disc gap-1 pl-5">
            <li>Change your name, email or password in Settings.</li>
            <li>Switch notifications, the calendar link or Apple Calendar off in Settings at any time.</li>
            <li>
              Delete your account in Settings → Account → “Delete account”: your account and everything about you in the club is
              deleted at once. Messages you wrote to a team stay, without your name.
            </li>
            <li>Want a copy of your data or have a question? Ask your club admin.</li>
          </ul>
        </Part>

        <p className="text-xs text-slate-500">
          Last changed 26 September 2026. <Link href="/" className="font-bold text-sky-300 underline">Back to Club OS</Link>
        </p>
      </div>
    </main>
  );
}
