import Link from 'next/link';
import { FacilityAccentEnhancer } from '@/shared/components/facilities/FacilityAccentEnhancer';

type AdminShellProps = {
  children: React.ReactNode;
  mode?: 'real' | 'demo';
};

const realLinks = [
  { href: '/admin/overview', label: 'Overview' },
  { href: '/admin/departments', label: 'Departments' },
  { href: '/admin/facilities', label: 'Facilities' },
  { href: '/admin/people', label: 'People' },
  { href: '/admin/settings', label: 'Settings' },
];

const demoLinks = [
  { href: '/demo/admin/overview', label: 'Overview' },
  { href: '/demo/admin/departments', label: 'Departments' },
  { href: '/demo/admin/facilities', label: 'Facilities' },
  { href: '/demo/admin/people', label: 'People' },
  { href: '/demo/admin/settings', label: 'Settings' },
];

export function AdminShell({ children, mode = 'real' }: AdminShellProps) {
  const links = mode === 'demo' ? demoLinks : realLinks;
  const accentClass = mode === 'demo' ? 'border-amber-500/30 bg-amber-950/20 text-amber-200' : 'border-sky-500/20 bg-slate-950/70 text-sky-200';

  return (
    <main className="min-h-screen bg-[radial-gradient(circle_at_top,#172554_0,#070A12_45%)] px-4 py-6 text-white sm:px-8">
      <FacilityAccentEnhancer />
      <div className="mx-auto max-w-6xl space-y-5">
        <nav className={`rounded-3xl border p-3 shadow-sm ${accentClass}`} aria-label="Admin navigation">
          <div className="flex flex-wrap gap-2">
            {links.map((link) => (
              <Link
                key={link.href}
                href={link.href}
                className="rounded-2xl border border-white/10 bg-slate-950/40 px-3 py-2 text-xs font-black text-slate-100 transition hover:border-white/30 hover:bg-slate-900/80"
              >
                {link.label}
              </Link>
            ))}
          </div>
        </nav>
        {children}
      </div>
    </main>
  );
}
