import Link from 'next/link';
import { ClubOperations3DObject } from '@/features/landing/ClubOperations3DObject';

export default function Landing3DLabPage() {
  return (
    <main className="min-h-screen overflow-hidden bg-[#050712] px-4 py-8 text-white sm:px-8">
      <div className="pointer-events-none fixed inset-0 -z-10">
        <div className="absolute left-1/2 top-[-12rem] h-[46rem] w-[46rem] -translate-x-1/2 rounded-full bg-sky-500/20 blur-3xl" />
        <div className="absolute right-[-12rem] top-56 h-[34rem] w-[34rem] rounded-full bg-emerald-500/10 blur-3xl" />
        <div className="absolute bottom-[-14rem] left-[-10rem] h-[34rem] w-[34rem] rounded-full bg-violet-500/10 blur-3xl" />
      </div>

      <div className="mx-auto max-w-7xl">
        <div className="mb-8 flex items-center justify-between gap-4">
          <div>
            <p className="text-xs font-black uppercase tracking-[0.22em] text-sky-300">Landing 3D lab</p>
            <h1 className="mt-2 text-3xl font-black tracking-tight sm:text-5xl">Club Operations 3D Object</h1>
            <p className="mt-3 max-w-2xl text-sm leading-7 text-slate-400">
              Isolated prototype for a product-relevant 3D object before integrating it into the landing page.
            </p>
          </div>
          <Link href="/" className="hidden rounded-2xl border border-slate-700 bg-slate-950/70 px-5 py-3 text-sm font-black text-slate-200 transition hover:border-sky-400/60 hover:bg-slate-900 sm:inline-flex">
            Back to landing
          </Link>
        </div>

        <ClubOperations3DObject />
      </div>
    </main>
  );
}
