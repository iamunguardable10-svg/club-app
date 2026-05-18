'use client';

import { useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import {
  createInitialFacilityDraftRows,
  FacilityRowsEditor,
  getCompletedFacilityDraftRows,
  type FacilityDraftRow,
} from '@/shared/components/facilities/FacilityRowsEditor';
import { saveDemoClubSetup } from '@/shared/dev/demoStorage';

function parseList(value: string) {
  return value
    .split('\n')
    .map((item) => item.trim())
    .filter(Boolean);
}

export function DemoCreateClubForm() {
  const router = useRouter();
  const [clubName, setClubName] = useState('Demo Club');
  const [city, setCity] = useState('Munich');
  const [country, setCountry] = useState('Germany');
  const [departments, setDepartments] = useState('Basketball\nFootball\nFencing');
  const [facilities, setFacilities] = useState<FacilityDraftRow[]>(
    createInitialFacilityDraftRows([
      { name: 'Main Hall', address: 'Sportstraße 1, Munich' },
      { name: 'Court 1', address: 'Sportstraße 1, Munich' },
      { name: 'Court 2', address: 'Sportstraße 1, Munich' },
      { name: 'Weight Room', address: 'Sportstraße 1, Munich' },
    ]),
  );
  const [selectedTeamDepartment, setSelectedTeamDepartment] = useState('Basketball');
  const [teams, setTeams] = useState('U14 Boys\nU16 Boys\nU18 Boys\nFirst Team');
  const [createTeamsNow, setCreateTeamsNow] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const departmentList = useMemo(() => parseList(departments), [departments]);
  const completedFacilityCount = useMemo(() => getCompletedFacilityDraftRows(facilities).length, [facilities]);
  const teamCount = useMemo(() => (createTeamsNow ? parseList(teams).length : 0), [createTeamsNow, teams]);

  function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);

    const departmentNames = parseList(departments);
    const facilityRows = getCompletedFacilityDraftRows(facilities);
    const facilityDetails = facilityRows.map((facility) => ({
      name: facility.name,
      address: facility.address,
      scope: 'club_shared' as const,
      ownerDepartment: null,
    }));

    if (!clubName.trim()) {
      setError('Add a club name.');
      return;
    }

    if (departmentNames.length === 0) {
      setError('Add at least one department.');
      return;
    }

    saveDemoClubSetup({
      clubName: clubName.trim(),
      city: city.trim(),
      country: country.trim(),
      departments: departmentNames,
      facilities: facilityDetails.map((facility) => facility.name),
      facilityDetails,
      createTeamsNow,
      selectedTeamDepartment: createTeamsNow ? selectedTeamDepartment : '',
      teams: createTeamsNow ? parseList(teams) : [],
      createdAt: new Date().toISOString(),
    });

    router.push('/demo/admin/overview');
  }

  return (
    <main className="min-h-screen bg-[radial-gradient(circle_at_top,#92400E_0,#070A12_45%)] px-4 py-8 text-white sm:px-8">
      <div className="mx-auto max-w-5xl">
        <div className="overflow-hidden rounded-3xl border border-amber-500/30 bg-[linear-gradient(135deg,rgba(120,53,15,0.34),rgba(2,6,23,0.78))] p-6 shadow-[0_18px_50px_rgba(0,0,0,0.24)]">
          <div className="grid gap-5 lg:grid-cols-[1.2fr_0.8fr] lg:items-end">
            <div>
              <p className="text-xs font-black uppercase tracking-[0.24em] text-amber-300">Local demo mode</p>
              <h1 className="mt-3 text-3xl font-black tracking-tight sm:text-5xl">Build the club spine</h1>
              <p className="mt-4 max-w-3xl text-sm leading-6 text-amber-100/80">Browser-only preview of the same setup flow: club, departments, facilities, then optionally the first teams.</p>
            </div>
            <div className="grid grid-cols-2 gap-2 text-sm">
              <div className="rounded-2xl border border-amber-500/20 bg-slate-950/35 p-3"><p className="text-xs uppercase tracking-[0.16em] text-amber-100/60">Departments</p><p className="mt-1 text-2xl font-black">{departmentList.length}</p></div>
              <div className="rounded-2xl border border-amber-500/20 bg-slate-950/35 p-3"><p className="text-xs uppercase tracking-[0.16em] text-amber-100/60">Facilities</p><p className="mt-1 text-2xl font-black">{completedFacilityCount}</p></div>
              <div className="rounded-2xl border border-amber-500/20 bg-slate-950/35 p-3"><p className="text-xs uppercase tracking-[0.16em] text-amber-100/60">Teams now</p><p className="mt-1 text-2xl font-black">{teamCount}</p></div>
              <div className="rounded-2xl border border-amber-500/20 bg-slate-950/35 p-3"><p className="text-xs uppercase tracking-[0.16em] text-amber-100/60">Mode</p><p className="mt-1 text-sm font-black">{createTeamsNow ? 'Full start' : 'Lean start'}</p></div>
            </div>
          </div>
        </div>

        <form onSubmit={handleSubmit} className="mt-6 grid gap-5">
          <section className="rounded-3xl border border-slate-800 bg-slate-950/70 p-5">
            <p className="text-xs font-black uppercase tracking-[0.2em] text-sky-300">Step 1</p>
            <h2 className="mt-2 text-xl font-black">Club basics</h2>
            <div className="mt-4 grid gap-4 md:grid-cols-3">
              <label className="block md:col-span-2">
                <span className="text-sm font-bold text-slate-200">Club name</span>
                <input
                  required
                  value={clubName}
                  onChange={(event) => setClubName(event.target.value)}
                  className="mt-2 w-full rounded-xl border border-slate-700 bg-slate-900 px-4 py-3 text-sm outline-none focus:border-sky-400"
                />
              </label>
              <label className="block">
                <span className="text-sm font-bold text-slate-200">Country</span>
                <input
                  value={country}
                  onChange={(event) => setCountry(event.target.value)}
                  className="mt-2 w-full rounded-xl border border-slate-700 bg-slate-900 px-4 py-3 text-sm outline-none focus:border-sky-400"
                />
              </label>
              <label className="block md:col-span-3">
                <span className="text-sm font-bold text-slate-200">City</span>
                <input
                  value={city}
                  onChange={(event) => setCity(event.target.value)}
                  className="mt-2 w-full rounded-xl border border-slate-700 bg-slate-900 px-4 py-3 text-sm outline-none focus:border-sky-400"
                />
              </label>
            </div>
          </section>

          <section className="rounded-3xl border border-slate-800 bg-slate-950/70 p-5">
            <p className="text-xs font-black uppercase tracking-[0.2em] text-violet-300">Step 2</p>
            <h2 className="mt-2 text-xl font-black">Departments</h2>
            <p className="mt-2 text-sm leading-6 text-slate-400">Add one department per line.</p>
            <textarea
              required
              value={departments}
              onChange={(event) => {
                setDepartments(event.target.value);
                const nextDepartments = parseList(event.target.value);
                if (!nextDepartments.includes(selectedTeamDepartment)) {
                  setSelectedTeamDepartment(nextDepartments[0] ?? '');
                }
              }}
              className="mt-4 min-h-36 w-full rounded-xl border border-slate-700 bg-slate-900 px-4 py-3 text-sm outline-none focus:border-violet-400"
            />
          </section>

          <section className="rounded-3xl border border-slate-800 bg-slate-950/70 p-5">
            <p className="text-xs font-black uppercase tracking-[0.2em] text-emerald-300">Step 3</p>
            <h2 className="mt-2 text-xl font-black">Global facilities</h2>
            <p className="mt-2 text-sm leading-6 text-slate-400">Add halls, courts, rooms or locations. Addresses are optional during setup and can be completed later.</p>
            <FacilityRowsEditor facilities={facilities} onChange={setFacilities} />
          </section>

          <section className="rounded-3xl border border-slate-800 bg-slate-950/70 p-5">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
              <div>
                <p className="text-xs font-black uppercase tracking-[0.2em] text-amber-300">Optional step</p>
                <h2 className="mt-2 text-xl font-black">Create first teams now</h2>
                <p className="mt-2 max-w-2xl text-sm leading-6 text-slate-400">Teams are optional here and can later live under department pages.</p>
              </div>
              <label className="flex items-center gap-3 rounded-xl border border-slate-800 bg-slate-900 px-4 py-3 text-sm font-bold text-slate-200">
                <input
                  type="checkbox"
                  checked={createTeamsNow}
                  onChange={(event) => setCreateTeamsNow(event.target.checked)}
                  className="h-4 w-4"
                />
                Create teams now
              </label>
            </div>

            {createTeamsNow ? (
              <div className="mt-5 grid gap-4 md:grid-cols-[0.8fr_1.2fr]">
                <label className="block">
                  <span className="text-sm font-bold text-slate-200">Department for these teams</span>
                  <select
                    value={selectedTeamDepartment}
                    onChange={(event) => setSelectedTeamDepartment(event.target.value)}
                    className="mt-2 w-full rounded-xl border border-slate-700 bg-slate-900 px-4 py-3 text-sm outline-none focus:border-amber-400"
                  >
                    {departmentList.map((department) => (
                      <option key={department} value={department}>
                        {department}
                      </option>
                    ))}
                  </select>
                </label>

                <label className="block">
                  <span className="text-sm font-bold text-slate-200">Teams</span>
                  <textarea
                    value={teams}
                    onChange={(event) => setTeams(event.target.value)}
                    className="mt-2 min-h-36 w-full rounded-xl border border-slate-700 bg-slate-900 px-4 py-3 text-sm outline-none focus:border-amber-400"
                  />
                </label>
              </div>
            ) : null}
          </section>

          {error ? (
            <div className="rounded-2xl border border-red-900/70 bg-red-950/40 px-4 py-3 text-sm text-red-200">{error}</div>
          ) : null}

          <button
            type="submit"
            className="rounded-2xl bg-amber-300 px-5 py-4 text-sm font-black text-slate-950 transition hover:bg-amber-200"
          >
            Save local demo setup
          </button>
        </form>
      </div>
    </main>
  );
}
