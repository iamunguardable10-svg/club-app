import Link from 'next/link';

type FacilityCalendarPageProps = {
  params: Promise<{
    facilityId: string;
  }>;
  searchParams?: Promise<{
    from?: string;
  }>;
};

function getBackTarget(from?: string) {
  if (from === 'departments') {
    return {
      href: '/admin/departments',
      label: '← Back to departments',
    };
  }

  if (from === 'overview') {
    return {
      href: '/admin/overview',
      label: '← Back to overview',
    };
  }

  return {
    href: '/admin/facilities',
    label: '← Back to facilities',
  };
}

export default async function FacilityCalendarPage({ params, searchParams }: FacilityCalendarPageProps) {
  const { facilityId } = await params;
  const resolvedSearchParams = searchParams ? await searchParams : undefined;
  const backTarget = getBackTarget(resolvedSearchParams?.from);

  return (
    <main className="min-h-screen bg-[radial-gradient(circle_at_top,#064E3B_0,#070A12_45%)] px-4 py-8 text-white sm:px-8">
      <div className="mx-auto max-w-5xl space-y-5">
        <section className="rounded-3xl border border-slate-800 bg-slate-950/80 p-6 shadow-sm">
          <Link href={backTarget.href} className="inline-flex items-center text-sm font-black text-emerald-300 hover:text-emerald-200">
            {backTarget.label}
          </Link>
          <p className="mt-5 text-xs font-black uppercase tracking-[0.24em] text-emerald-300">Facility calendar</p>
          <h1 className="mt-3 text-3xl font-black tracking-tight sm:text-5xl">Facility calendar placeholder</h1>
          <p className="mt-3 max-w-3xl text-sm leading-6 text-slate-400">
            This page will later show bookings, team sessions, conflicts and availability for one facility.
          </p>
        </section>

        <section className="rounded-3xl border border-slate-800 bg-slate-950/70 p-5">
          <p className="text-xs font-black uppercase tracking-[0.18em] text-sky-300">Selected facility</p>
          <p className="mt-3 break-all text-sm font-bold text-slate-300">{facilityId}</p>
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
