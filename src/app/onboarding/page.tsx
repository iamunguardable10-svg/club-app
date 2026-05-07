import Link from 'next/link';

export default function OnboardingPage() {
  return (
    <main className="min-h-screen bg-[radial-gradient(circle_at_top,#312E81_0,#070A12_45%)] px-4 py-10 text-white sm:px-8">
      <div className="mx-auto max-w-4xl">
        <p className="text-xs font-black uppercase tracking-[0.24em] text-violet-300">Onboarding</p>
        <h1 className="mt-4 max-w-3xl text-4xl font-black tracking-tight sm:text-5xl">
          No club or team membership yet.
        </h1>
        <p className="mt-5 max-w-2xl text-base leading-7 text-slate-400">
          Your account exists, but you are not connected to a club, department or team yet. Create a club, accept a coach invite or join a team with a code.
        </p>

        <div className="mt-8 grid gap-4 md:grid-cols-3">
          <Link href="/onboarding/create-club" className="rounded-2xl border border-sky-500/40 bg-sky-950/30 p-5 transition hover:border-sky-300 hover:bg-sky-950/50">
            <h2 className="text-lg font-black">Create club</h2>
            <p className="mt-2 text-sm leading-6 text-slate-300">For club admins starting a new club workspace.</p>
            <p className="mt-4 text-sm font-black text-sky-300">Start setup →</p>
          </Link>

          <div className="rounded-2xl border border-slate-800 bg-slate-950/70 p-5">
            <h2 className="text-lg font-black">Accept invite</h2>
            <p className="mt-2 text-sm leading-6 text-slate-400">For department leads and coaches with a personal invite link.</p>
            <p className="mt-4 text-sm font-bold text-slate-500">Coming next</p>
          </div>

          <div className="rounded-2xl border border-slate-800 bg-slate-950/70 p-5">
            <h2 className="text-lg font-black">Join team</h2>
            <p className="mt-2 text-sm leading-6 text-slate-400">For athletes with a reusable team code from their coach.</p>
            <p className="mt-4 text-sm font-bold text-slate-500">Coming next</p>
          </div>
        </div>

        <div className="mt-8 rounded-2xl border border-slate-800 bg-slate-950/70 p-5">
          <p className="text-sm font-bold text-white">Current V1 status</p>
          <p className="mt-2 text-sm leading-6 text-slate-400">
            Club creation is now the first real onboarding action. Invite and join-code flows come after the admin setup foundation.
          </p>
          <Link href="/" className="mt-4 inline-block rounded-xl border border-slate-700 px-4 py-2 text-sm font-bold text-slate-200 hover:border-sky-400">
            Back to home
          </Link>
        </div>
      </div>
    </main>
  );
}
