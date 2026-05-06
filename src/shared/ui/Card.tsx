import type { ReactNode } from 'react';

export function Card({
  eyebrow,
  title,
  children,
}: {
  eyebrow?: string;
  title: string;
  children: ReactNode;
}) {
  return (
    <section className="rounded-2xl border border-slate-800 bg-slate-950/70 p-5 shadow-sm">
      {eyebrow ? (
        <p className="text-xs font-bold uppercase tracking-[0.18em] text-sky-300">{eyebrow}</p>
      ) : null}
      <h2 className="mt-2 text-xl font-black text-white">{title}</h2>
      <div className="mt-3 text-sm leading-6 text-slate-400">{children}</div>
    </section>
  );
}
