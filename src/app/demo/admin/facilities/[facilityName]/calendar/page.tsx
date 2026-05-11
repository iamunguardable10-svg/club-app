import Link from 'next/link';

type DemoFacilityCalendarPageProps = {
  params: Promise<{
    facilityName: string;
  }>;
};

export default async function DemoFacilityCalendarPage({ params }: DemoFacilityCalendarPageProps) {
  const { facilityName } = await params;
  const decodedFacilityName = decodeURIComponent(facilityName);

  return (
    <main className="min-h-screen bg-[radial-gradient(circle_at_top,#92400E_0,#070A12_45%)] px-4 py-8 text-white sm:px-8">
      <div className="mx-auto max-w-5xl space-y-5">
        <section className="rounded-3xl border border-amber-500/30 bg-amber-950/20 p-6 shadow-sm">
          <Link href="/demo/admin/facilities" className="inline-flex items-center text-sm font-black text-amber-200 hover:text-amber-100">
            ← Back to local facilities
          </Link>
          <p className="mt-5 text-xs font-black uppercase tracking-[0.24em] text-amber-300">Local demo facility calendar</p>
          <h1 className="mt-3 text-3xl font-black tracking-tight sm:text-5xl">{decodedFacilityName}</h1>
          <p className="mt-3 max-w-3xl text-sm leading-6 text-amber-100/80">
            Placeholder for the future facility calendar. This demo page does not write to Supabase.
          </p>
        </section>

        <section className="rounded-3xl border border-slate-800 bg-slate-950/70 p-5">
          <p className="text-xs font-black uppercase tracking-[0.18em] text-sky-300">Future modules</p>
          <div className="mt-5 grid gap-3 md:grid-cols-3">
            <div className="rounded-2xl border border-slate-800 bg-slate-900/60 p-4">
              <p className="font-black">Calendar</p>
              <p className="mt-2 text-sm leading-6 text-slate-400">Weekly and monthly facility usage view.</p>
            </div>
            <div className="rounded-2xl border border-slate-800 bg-slate-900/60 p-4">
              <p className="font-black">Bookings</p>
              <p className="mt-2 text-sm leading-6 text-slate-400">Training sessions, games and manual reservations.</p>
            </div>
            <div className="rounded-2xl border border-slate-800 bg-slate-900/60 p-4">
              <p className="font-black">Conflicts</p>
              <p className="mt-2 text-sm leading-6 text-slate-400">Overlaps and double-bookings across departments.</p>
            </div>
          </div>
        </section>
      </div>
    </main>
  );
}
