import Link from 'next/link';

export default function HomePage() {
  return (
    <main className="min-h-screen bg-[#070a12] px-4 py-10 text-white sm:px-8">
      <div className="mx-auto flex min-h-[calc(100vh-5rem)] max-w-3xl flex-col justify-center">
        <p className="text-xs font-bold uppercase tracking-[0.22em] text-slate-500">Club App</p>
        <h1 className="mt-4 text-4xl font-black tracking-tight sm:text-6xl">Start</h1>
        <p className="mt-4 max-w-xl text-sm leading-7 text-slate-400">
          Die Landing Page wurde entfernt. Nutze den Demo-Modus oder den Setup-Flow, um die App zu testen.
        </p>
        <div className="mt-8 flex flex-col gap-3 sm:flex-row">
          <Link href="/demo" className="inline-flex items-center justify-center rounded-2xl bg-amber-300 px-6 py-4 text-sm font-black text-slate-950 transition hover:bg-amber-200">
            Demo öffnen
          </Link>
          <Link href="/onboarding/create-club/start" className="inline-flex items-center justify-center rounded-2xl bg-emerald-400 px-6 py-4 text-sm font-black text-slate-950 transition hover:bg-emerald-300">
            Club erstellen
          </Link>
          <Link href="/auth/login" className="inline-flex items-center justify-center rounded-2xl border border-slate-700 px-6 py-4 text-sm font-black text-slate-200 transition hover:border-slate-500">
            Login
          </Link>
        </div>
      </div>
    </main>
  );
}
