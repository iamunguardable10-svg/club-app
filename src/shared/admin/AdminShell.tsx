import Link from 'next/link';
import { DepartmentWorkspaceModeEnhancer } from '@/shared/components/departments/DepartmentWorkspaceModeEnhancer';
import { FacilityAccentEnhancer } from '@/shared/components/facilities/FacilityAccentEnhancer';
import { TeamDefaultFacilityLinkEnhancer } from '@/shared/components/facilities/TeamDefaultFacilityLinkEnhancer';
import { TeamDeleteEnhancer } from '@/shared/components/facilities/TeamDeleteEnhancer';

type AdminShellProps = {
  children: React.ReactNode;
  mode?: 'real' | 'demo';
};

const realLinks = [
  { href: '/admin/overview', label: 'Overview' },
  { href: '/admin/departments', label: 'Departments' },
  { href: '/admin/teams', label: 'Teams' },
  { href: '/admin/facilities', label: 'Facilities' },
  { href: '/admin/people', label: 'Staff' },
  { href: '/admin/settings', label: 'Settings' },
];

const demoLinks = [
  { href: '/demo/admin/overview', label: 'Overview' },
  { href: '/demo/admin/departments', label: 'Departments' },
  { href: '/demo/admin/teams', label: 'Teams' },
  { href: '/demo/admin/facilities', label: 'Facilities' },
  { href: '/demo/admin/people', label: 'Staff' },
  { href: '/demo/admin/settings', label: 'Settings' },
];

export function AdminShell({ children, mode = 'real' }: AdminShellProps) {
  const links = mode === 'demo' ? demoLinks : realLinks;
  const modeChipClass = mode === 'demo' ? 'border-amber-400/30 bg-amber-300/10 text-amber-200' : 'border-sky-400/25 bg-sky-300/10 text-sky-200';

  return (
    <main className="os-page">
      <FacilityAccentEnhancer />
      <TeamDefaultFacilityLinkEnhancer />
      <TeamDeleteEnhancer mode={mode} />
      <DepartmentWorkspaceModeEnhancer />
      <div className="os-container space-y-5">
        <nav className="sticky top-3 z-30 rounded-3xl border border-slate-800/90 bg-slate-950/78 p-2 shadow-[0_18px_80px_rgba(0,0,0,0.28)] ring-1 ring-white/[0.04] backdrop-blur-xl" aria-label="Admin navigation">
          <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
            <Link href={mode === 'demo' ? '/demo/admin/overview' : '/admin/overview'} className="flex items-center gap-3 px-2">
              <span className="grid h-9 w-9 place-items-center rounded-2xl border border-sky-400/25 bg-sky-300/10 text-xs font-black text-sky-200">OS</span>
              <span>
                <span className="block text-sm font-black leading-none text-white">Club OS</span>
                <span className="mt-1 block text-[10px] font-black uppercase tracking-[0.18em] text-slate-500">Operations</span>
              </span>
            </Link>
            <div className="flex flex-wrap gap-1.5">
            {links.map((link) => (
              <Link
                key={link.href}
                href={link.href}
                className="rounded-2xl border border-white/10 bg-white/[0.03] px-3 py-2 text-xs font-black text-slate-200 transition hover:border-sky-300/40 hover:bg-sky-300/10 hover:text-white"
              >
                {link.label}
              </Link>
            ))}
              <span className={`rounded-2xl border px-3 py-2 text-xs font-black ${modeChipClass}`}>{mode === 'demo' ? 'Demo' : 'Live'}</span>
            </div>
          </div>
        </nav>
        {children}
      </div>
    </main>
  );
}
