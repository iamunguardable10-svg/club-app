'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { AdminShell } from '@/shared/admin/AdminShell';
import { getDemoClubSetup, type DemoClubSetup } from '@/shared/dev/demoStorage';

type DemoInviteRole = 'department_lead' | 'head_coach' | 'assistant_coach';

type DemoInvite = {
  id: string;
  token: string;
  role: DemoInviteRole;
  department: string;
  team: string | null;
  status: 'pending' | 'accepted' | 'revoked' | 'expired';
  createdAt: string;
  expiresAt: string | null;
};

const DEMO_INVITES_KEY = 'club-app.demo.invites';

function getDemoInvites(): DemoInvite[] {
  if (typeof window === 'undefined') return [];
  const raw = window.localStorage.getItem(DEMO_INVITES_KEY);
  if (!raw) return [];
  try {
    return JSON.parse(raw) as DemoInvite[];
  } catch {
    return [];
  }
}

function saveDemoInvites(invites: DemoInvite[]) {
  if (typeof window === 'undefined') return;
  window.localStorage.setItem(DEMO_INVITES_KEY, JSON.stringify(invites));
}

function createToken() {
  const bytes = new Uint8Array(8);
  crypto.getRandomValues(bytes);
  return Array.from(bytes)
    .map((byte) => byte.toString(16).padStart(2, '0'))
    .join('');
}

function roleLabel(role: DemoInviteRole) {
  if (role === 'department_lead') return 'Department Lead';
  if (role === 'head_coach') return 'Head Coach';
  return 'Assistant Coach';
}

export function DemoAdminPeopleManager() {
  const searchParams = useSearchParams();
  const requestedDepartment = searchParams.get('department') ?? '';
  const [setup, setSetup] = useState<DemoClubSetup | null>(null);
  const [invites, setInvites] = useState<DemoInvite[]>([]);
  const [selectedDepartment, setSelectedDepartment] = useState('');
  const [selectedRole, setSelectedRole] = useState<DemoInviteRole>('department_lead');
  const [selectedTeam, setSelectedTeam] = useState('');
  const [expiresInDays, setExpiresInDays] = useState('14');
  const [copiedToken, setCopiedToken] = useState<string | null>(null);

  useEffect(() => {
    const currentSetup = getDemoClubSetup();
    const currentInvites = getDemoInvites();
    const initialDepartment = currentSetup?.departments.includes(requestedDepartment)
      ? requestedDepartment
      : currentSetup?.departments[0] ?? '';

    setSetup(currentSetup);
    setInvites(currentInvites);
    setSelectedDepartment(initialDepartment);
    setSelectedTeam(currentSetup?.teams[0] ?? '');
  }, [requestedDepartment]);

  const pendingInvites = useMemo(() => invites.filter((invite) => invite.status === 'pending'), [invites]);
  const nonPendingInvites = useMemo(() => invites.filter((invite) => invite.status !== 'pending'), [invites]);

  function getInviteUrl(token: string) {
    if (typeof window === 'undefined') return `/invite/${token}`;
    return `${window.location.origin}/invite/${token}`;
  }

  function persistInvites(nextInvites: DemoInvite[]) {
    setInvites(nextInvites);
    saveDemoInvites(nextInvites);
  }

  function handleCreateInvite(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!setup || !selectedDepartment) return;

    const isCoachInvite = selectedRole === 'head_coach' || selectedRole === 'assistant_coach';
    const parsedDays = Number.parseInt(expiresInDays, 10);
    const expiresAt = Number.isFinite(parsedDays) && parsedDays > 0
      ? new Date(Date.now() + parsedDays * 24 * 60 * 60 * 1000).toISOString()
      : null;

    const invite: DemoInvite = {
      id: crypto.randomUUID(),
      token: createToken(),
      role: selectedRole,
      department: selectedDepartment,
      team: isCoachInvite ? selectedTeam || null : null,
      status: 'pending',
      createdAt: new Date().toISOString(),
      expiresAt,
    };

    persistInvites([invite, ...invites]);
  }

  function handleRevokeInvite(inviteId: string) {
    persistInvites(invites.map((invite) => (invite.id === inviteId ? { ...invite, status: 'revoked' } : invite)));
  }

  async function handleCopy(token: string) {
    await navigator.clipboard.writeText(getInviteUrl(token));
    setCopiedToken(token);
    window.setTimeout(() => setCopiedToken(null), 1500);
  }

  if (!setup) {
    return (
      <AdminShell mode="demo">
        <section className="rounded-3xl border border-amber-500/30 bg-amber-950/20 p-6 shadow-sm">
          <p className="text-xs font-black uppercase tracking-[0.24em] text-amber-300">Local demo people</p>
          <h1 className="mt-3 text-3xl font-black tracking-tight sm:text-5xl">No local demo club yet</h1>
          <p className="mt-3 max-w-3xl text-sm leading-6 text-amber-100/80">
            Create a local demo club first before testing invite links.
          </p>
          <Link href="/demo/create-club" className="mt-5 inline-block rounded-xl bg-amber-300 px-4 py-3 text-sm font-black text-slate-950 transition hover:bg-amber-200">
            Create local demo setup
          </Link>
        </section>
      </AdminShell>
    );
  }

  return (
    <AdminShell mode="demo">
      <section className="rounded-3xl border border-amber-500/30 bg-amber-950/20 p-6 shadow-sm">
        <p className="text-xs font-black uppercase tracking-[0.24em] text-amber-300">Local demo people</p>
        <h1 className="mt-3 text-3xl font-black tracking-tight sm:text-5xl">People & Invites</h1>
        <p className="mt-3 max-w-3xl text-sm leading-6 text-amber-100/80">
          Browser-only invite preview for department leads and coaches. These links are demo data and do not write to Supabase.
        </p>
      </section>

      <section className="grid gap-5 lg:grid-cols-[0.9fr_1.1fr]">
        <form onSubmit={handleCreateInvite} className="rounded-3xl border border-slate-800 bg-slate-950/70 p-5">
          <p className="text-xs font-black uppercase tracking-[0.18em] text-emerald-300">Create invite</p>
          <h2 className="mt-2 text-xl font-black">Department-based invite</h2>
          <div className="mt-4 space-y-4">
            <label className="block">
              <span className="text-sm font-bold text-slate-200">Department</span>
              <select
                value={selectedDepartment}
                onChange={(event) => setSelectedDepartment(event.target.value)}
                className="mt-2 w-full rounded-xl border border-slate-700 bg-slate-900 px-4 py-3 text-sm outline-none focus:border-emerald-400"
              >
                {setup.departments.map((department) => (
                  <option key={department} value={department}>
                    {department}
                  </option>
                ))}
              </select>
            </label>

            <label className="block">
              <span className="text-sm font-bold text-slate-200">Role</span>
              <select
                value={selectedRole}
                onChange={(event) => setSelectedRole(event.target.value as DemoInviteRole)}
                className="mt-2 w-full rounded-xl border border-slate-700 bg-slate-900 px-4 py-3 text-sm outline-none focus:border-emerald-400"
              >
                <option value="department_lead">Department Lead</option>
                <option value="head_coach">Head Coach</option>
                <option value="assistant_coach">Assistant Coach</option>
              </select>
            </label>

            {selectedRole !== 'department_lead' ? (
              <label className="block">
                <span className="text-sm font-bold text-slate-200">Team for coach invite</span>
                <select
                  value={selectedTeam}
                  onChange={(event) => setSelectedTeam(event.target.value)}
                  className="mt-2 w-full rounded-xl border border-slate-700 bg-slate-900 px-4 py-3 text-sm outline-none focus:border-emerald-400"
                >
                  {setup.teams.length > 0 ? (
                    setup.teams.map((team) => (
                      <option key={team} value={team}>
                        {team}
                      </option>
                    ))
                  ) : (
                    <option value="">No demo teams yet</option>
                  )}
                </select>
                <p className="mt-2 text-xs leading-5 text-slate-500">
                  Coach invites are team-based in the current V1 acceptance model.
                </p>
              </label>
            ) : null}

            <label className="block">
              <span className="text-sm font-bold text-slate-200">Expires in days</span>
              <input
                type="number"
                min="1"
                value={expiresInDays}
                onChange={(event) => setExpiresInDays(event.target.value)}
                className="mt-2 w-full rounded-xl border border-slate-700 bg-slate-900 px-4 py-3 text-sm outline-none focus:border-emerald-400"
              />
            </label>

            <button
              type="submit"
              disabled={setup.departments.length === 0 || (selectedRole !== 'department_lead' && setup.teams.length === 0)}
              className="w-full rounded-xl bg-emerald-400 px-4 py-3 text-sm font-black text-slate-950 transition hover:bg-emerald-300 disabled:cursor-not-allowed disabled:opacity-60"
            >
              Create local invite link
            </button>
          </div>
        </form>

        <section className="rounded-3xl border border-slate-800 bg-slate-950/70 p-5">
          <p className="text-xs font-black uppercase tracking-[0.18em] text-amber-300">Pending invites</p>
          <h2 className="mt-2 text-xl font-black">Links to send</h2>
          <div className="mt-4 space-y-3">
            {pendingInvites.length > 0 ? (
              pendingInvites.map((invite) => (
                <div key={invite.id} className="rounded-2xl border border-slate-800 bg-slate-900/60 p-4">
                  <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                    <div>
                      <p className="font-black text-white">{roleLabel(invite.role)}</p>
                      <p className="mt-1 text-xs text-slate-500">
                        {invite.department}{invite.team ? ` · ${invite.team}` : ''}
                      </p>
                      <p className="mt-3 break-all rounded-xl border border-slate-800 bg-slate-950/70 px-3 py-2 text-xs text-slate-300">
                        {getInviteUrl(invite.token)}
                      </p>
                    </div>
                    <div className="flex gap-2 sm:flex-col">
                      <button
                        type="button"
                        onClick={() => handleCopy(invite.token)}
                        className="rounded-xl border border-sky-500/60 px-3 py-2 text-xs font-black text-sky-200 hover:bg-sky-950/40"
                      >
                        {copiedToken === invite.token ? 'Copied' : 'Copy'}
                      </button>
                      <button
                        type="button"
                        onClick={() => handleRevokeInvite(invite.id)}
                        className="rounded-xl border border-red-500/60 px-3 py-2 text-xs font-black text-red-200 hover:bg-red-950/40"
                      >
                        Revoke
                      </button>
                    </div>
                  </div>
                </div>
              ))
            ) : (
              <p className="rounded-2xl border border-slate-800 bg-slate-900/60 p-4 text-sm text-slate-400">No pending demo invites yet.</p>
            )}
          </div>
        </section>
      </section>

      <section className="rounded-3xl border border-slate-800 bg-slate-950/70 p-5">
        <p className="text-xs font-black uppercase tracking-[0.18em] text-slate-400">Invite history</p>
        <div className="mt-4 space-y-2">
          {nonPendingInvites.length > 0 ? (
            nonPendingInvites.map((invite) => (
              <div key={invite.id} className="flex flex-col gap-1 rounded-xl border border-slate-800 bg-slate-900/60 px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
                <p className="text-sm font-bold text-slate-200">{roleLabel(invite.role)}</p>
                <p className="text-xs font-bold uppercase tracking-[0.16em] text-slate-500">{invite.status}</p>
              </div>
            ))
          ) : (
            <p className="text-sm text-slate-500">No completed, revoked or expired demo invites yet.</p>
          )}
        </div>
      </section>
    </AdminShell>
  );
}
