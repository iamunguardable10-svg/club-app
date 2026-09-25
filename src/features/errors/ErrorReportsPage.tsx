'use client';

/**
 * Error reports for operators (piece 13): problem reports from people first,
 * then errors by when they last happened. Only operators (set on the server)
 * get anything; the server checks, not this page.
 */

import { useCallback, useEffect, useState } from 'react';

import { ActiveRoleShell, CoachSection } from '@/features/role-workspaces/RoleShell';
import { isOperator, isRemoteMode, listErrorReports, resolveErrorReport, type ErrorReport } from '@/shared/data';

const KIND_LABEL: Record<ErrorReport['kind'], string> = {
  problem: 'Problem report',
  crash: 'Crash',
  error: 'Error',
  rejected: 'Not saved',
  push: 'Notifications',
  server: 'Server',
};

const ROLE_LABEL = { coach: 'Coach', athlete: 'Player', club: 'Club' } as const;

function when(iso: string) {
  return new Date(iso).toLocaleString('en-GB', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });
}

export function ErrorReportsPage() {
  const [allowed, setAllowed] = useState<boolean | null>(null);
  const [showResolved, setShowResolved] = useState(false);
  const [reports, setReports] = useState<ErrorReport[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [openId, setOpenId] = useState<string | null>(null);

  useEffect(() => {
    if (!isRemoteMode()) { setAllowed(false); return; }
    void isOperator().then(setAllowed).catch(() => setAllowed(false));
  }, []);

  const load = useCallback(() => {
    setError(null);
    listErrorReports(showResolved).then(setReports).catch((caught) => setError(caught instanceof Error ? caught.message : String(caught)));
  }, [showResolved]);
  useEffect(() => { if (allowed) load(); }, [allowed, load]);

  async function toggle(report: ErrorReport) {
    try {
      await resolveErrorReport(report.id, report.resolvedAt === null);
      load();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : String(caught));
    }
  }

  const open = reports?.filter((report) => !report.resolvedAt).length ?? 0;

  return (
    <ActiveRoleShell title="Error reports" subtitle={reports ? `${open} open` : undefined}>
      {allowed === false ? (
        <CoachSection><p className="text-sm text-slate-400">Only operators can see error reports.</p></CoachSection>
      ) : (
        <CoachSection
          actions={(
            <div className="flex gap-2">
              <button type="button" onClick={() => setShowResolved((value) => !value)} aria-pressed={showResolved} className="rounded-full border border-slate-700 px-3 py-1.5 text-xs font-black text-slate-200">
                {showResolved ? 'Open only' : 'Show resolved too'}
              </button>
              <button type="button" onClick={load} className="rounded-full border border-slate-700 px-3 py-1.5 text-xs font-black text-slate-200">Refresh</button>
            </div>
          )}
        >
          {error ? <p role="alert" className="mb-3 text-sm font-bold text-red-200">{error}</p> : null}
          {reports === null ? <p className="text-sm text-slate-400">Loading …</p> : reports.length === 0 ? (
            <p className="text-sm text-slate-400">Nothing open. 🎉</p>
          ) : (
            <ul className="grid gap-2">
              {reports.map((report) => {
                const expanded = openId === report.id;
                const meta = [
                  report.page,
                  report.role ? ROLE_LABEL[report.role] : null,
                  report.mode === 'demo' ? 'demo' : null,
                  report.device,
                  report.appVersion ? `v ${report.appVersion}` : null,
                ].filter(Boolean).join(' · ');
                return (
                  <li key={report.id} className={`rounded-2xl border p-3 ${report.resolvedAt ? 'border-slate-800 opacity-60' : report.kind === 'problem' ? 'border-sky-300/40 bg-sky-300/[0.05]' : 'border-slate-800 bg-slate-950/55'}`}>
                    <div className="flex flex-wrap items-start justify-between gap-2">
                      <div className="min-w-0 flex-1">
                        <p className="text-[10px] font-black uppercase tracking-[0.16em] text-slate-400">
                          {KIND_LABEL[report.kind]}{report.reporter ? ` · ${report.reporter}` : ''}{report.count > 1 ? ` · ${report.count}×` : ''}
                        </p>
                        <p className="mt-1 break-words text-sm font-bold text-slate-100">{report.message}</p>
                        <p className="mt-1 text-xs text-slate-500">
                          {report.count > 1 ? `${when(report.firstSeen)} – ${when(report.lastSeen)}` : when(report.lastSeen)}{meta ? ` · ${meta}` : ''}
                        </p>
                      </div>
                      <div className="flex shrink-0 gap-2">
                        {report.detail && report.detail !== report.message ? (
                          <button type="button" onClick={() => setOpenId(expanded ? null : report.id)} aria-expanded={expanded} className="text-xs font-bold text-sky-300 underline">
                            {expanded ? 'Less' : 'More'}
                          </button>
                        ) : null}
                        <button type="button" onClick={() => void toggle(report)} className="rounded-full border border-slate-700 px-3 py-1 text-xs font-black text-slate-200">
                          {report.resolvedAt ? 'Reopen' : 'Resolved'}
                        </button>
                      </div>
                    </div>
                    {expanded ? (
                      <pre className="mt-2 max-h-72 overflow-auto whitespace-pre-wrap break-words rounded-xl bg-slate-900 p-2 text-[11px] text-slate-300">{report.detail}</pre>
                    ) : null}
                  </li>
                );
              })}
            </ul>
          )}
        </CoachSection>
      )}
    </ActiveRoleShell>
  );
}
