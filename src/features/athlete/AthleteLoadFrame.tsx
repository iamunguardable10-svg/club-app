'use client';

/**
 * The athlete's own load figures.
 *
 * Run 3 builds the frame and shows what the data layer already knows; entering
 * RPE and duration, the charts and the fuller ACWR explanation come in run 4,
 * together with splitting the 3216-line AthleteLoadWorkspace apart.
 *
 * What it will not do, now or later, is give training or health advice. It
 * shows numbers and places them roughly, nothing more.
 */

import Link from 'next/link';

import { loadEntriesForPerson, loadSummaryForPerson } from '@/shared/data';
import { AthleteShell, dayFormat } from './AthleteShell';

export function AthleteLoadFrame() {
  return (
    <AthleteShell mode="load" title="Belastung">
      {({ database, athlete }) => {
        const summary = loadSummaryForPerson(database, athlete.id);
        const recent = loadEntriesForPerson(database, athlete.id).slice(-10).reverse();

        return (
          <>
            <section className="grid gap-3 sm:grid-cols-3">
              <div className="os-panel p-5">
                <p className="text-xs font-black uppercase tracking-[0.18em] text-slate-500">7 Tage</p>
                <p className="mt-2 text-2xl font-black text-white">{summary.acuteLoad}</p>
                <p className="mt-1 text-xs text-slate-500">akute Last im Schnitt</p>
              </div>
              <div className="os-panel p-5">
                <p className="text-xs font-black uppercase tracking-[0.18em] text-slate-500">28 Tage</p>
                <p className="mt-2 text-2xl font-black text-white">{summary.chronicLoad}</p>
                <p className="mt-1 text-xs text-slate-500">chronische Last im Schnitt</p>
              </div>
              <div className="os-panel p-5">
                <p className="text-xs font-black uppercase tracking-[0.18em] text-slate-500">Verhältnis</p>
                {summary.chronicFull && summary.acwr !== null ? (
                  <>
                    <p className="mt-2 text-2xl font-black text-white">{summary.acwr.toFixed(2)}</p>
                    <p className="mt-1 text-xs text-slate-500">{summary.zone.label}</p>
                  </>
                ) : (
                  <>
                    <p className="mt-2 text-sm font-bold text-slate-400">Noch zu wenige Daten</p>
                    <p className="mt-1 text-xs text-slate-500">
                      Erst nach rund vier Wochen ergibt der Wert etwas.
                    </p>
                  </>
                )}
              </div>
            </section>

            <section className="os-panel-soft p-5 text-sm text-slate-400">
              <p className="text-xs font-black uppercase tracking-[0.18em] text-slate-500">Was das heißt</p>
              <p className="mt-2">
                Das Verhältnis vergleicht die letzten sieben Tage mit den letzten vier Wochen.
                Um 1 herum bedeutet: ähnlich viel wie zuletzt. Deutlich darunter heißt weniger
                als gewohnt, deutlich darüber ein schneller Anstieg. Es ist eine Orientierung,
                keine Trainings- oder Gesundheitsempfehlung.
              </p>
            </section>

            <section className="space-y-3">
              <h2 className="os-label">Zuletzt eingetragen</h2>
              {recent.length === 0 ? (
                <p className="os-panel p-5 text-sm text-slate-400">Noch nichts eingetragen.</p>
              ) : (
                <ul className="space-y-2">
                  {recent.map((entry) => (
                    <li key={entry.id} className="flex flex-wrap items-baseline justify-between gap-2 rounded-2xl border border-slate-800 bg-slate-950/60 px-4 py-3">
                      <span className="text-sm font-bold text-white">{entry.title}</span>
                      <span className="text-xs text-slate-400">
                        {dayFormat.format(new Date(`${entry.date}T00:00:00`))} · RPE {entry.rpe} · {entry.durationMinutes} Min · Last {entry.load}
                      </span>
                    </li>
                  ))}
                </ul>
              )}
            </section>

            <section className="rounded-3xl border border-slate-800 bg-slate-950/40 p-5 text-sm text-slate-400">
              Das Eintragen von RPE und Dauer kommt im nächsten Schritt. Bis dahin stammen die
              Werte aus den Testdaten.{' '}
              <Link href="/athlete/calendar" className="underline">Zum Kalender</Link>
            </section>
          </>
        );
      }}
    </AthleteShell>
  );
}
