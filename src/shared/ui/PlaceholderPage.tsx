import { Card } from './Card';

export function PlaceholderPage({
  area,
  title,
  description,
  primaryFocus,
  nextModules,
}: {
  area: 'Admin' | 'Coach' | 'Athlete' | 'Auth' | 'Invite';
  title: string;
  description: string;
  primaryFocus: string;
  nextModules?: string[];
}) {
  return (
    <main className="min-h-screen bg-[radial-gradient(circle_at_top,#172554_0,#070A12_42%)] px-4 py-6 text-white sm:px-8">
      <div className="mx-auto max-w-5xl space-y-5">
        <div className="rounded-3xl border border-slate-800 bg-slate-950/60 p-6">
          <p className="text-xs font-bold uppercase tracking-[0.22em] text-violet-300">{area} Workspace</p>
          <h1 className="mt-3 text-3xl font-black tracking-tight sm:text-4xl">{title}</h1>
          <p className="mt-3 max-w-3xl text-sm leading-6 text-slate-400">{description}</p>
        </div>

        <div className="grid gap-4 lg:grid-cols-[1.2fr_0.8fr]">
          <Card eyebrow="V1 Focus" title="Primary job">
            <p>{primaryFocus}</p>
          </Card>

          <Card eyebrow="Placeholder" title="Not implemented yet">
            <p>This screen intentionally starts as a placeholder. The structure comes first; detailed features come after the core flows are stable.</p>
          </Card>
        </div>

        {nextModules && nextModules.length > 0 ? (
          <Card eyebrow="Later modules" title="Planned building blocks">
            <ul className="grid gap-2 sm:grid-cols-2">
              {nextModules.map((item) => (
                <li key={item} className="rounded-xl border border-slate-800 bg-slate-900/50 px-3 py-2 text-slate-300">
                  {item}
                </li>
              ))}
            </ul>
          </Card>
        ) : null}
      </div>
    </main>
  );
}
