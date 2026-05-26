'use client';

import { useMemo, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import {
  createInitialFacilityDraftRows,
  FacilityRowsEditor,
  getCompletedFacilityDraftRows,
  type FacilityDraftRow,
} from '@/shared/components/facilities/FacilityRowsEditor';
import { createBrowserSupabaseClient } from '@/shared/lib/supabase/client';

function parseList(value: string) {
  return value
    .split('\n')
    .map((item) => item.trim())
    .filter(Boolean);
}

type InitialClubSetupResult = {
  club_id?: string;
  facilities?: Array<{
    id?: string;
    name?: string;
  }>;
};

function normalizeName(value: string) {
  return value.trim().toLowerCase();
}

export function CreateClubForm() {
  const router = useRouter();
  const [clubName, setClubName] = useState('');
  const [city, setCity] = useState('');
  const [country, setCountry] = useState('Germany');
  const [departments, setDepartments] = useState('Basketball\nFootball\nFencing');
  const [facilities, setFacilities] = useState<FacilityDraftRow[]>(
    createInitialFacilityDraftRows([
      { name: 'Main Hall' },
      { name: 'Court 1' },
      { name: 'Court 2' },
      { name: 'Weight Room' },
    ]),
  );
  const [selectedTeamDepartment, setSelectedTeamDepartment] = useState('Basketball');
  const [teams, setTeams] = useState('U14 Boys\nU16 Boys\nU18 Boys\nFirst Team');
  const [createTeamsNow, setCreateTeamsNow] = useState(true);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const departmentList = useMemo(() => parseList(departments), [departments]);
  const completedFacilityCount = useMemo(() => getCompletedFacilityDraftRows(facilities).length, [facilities]);
  const teamCount = useMemo(() => (createTeamsNow ? parseList(teams).length : 0), [createTeamsNow, teams]);

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setIsLoading(true);
    setError(null);

    const supabase = createBrowserSupabaseClient();

    const {
      data: { user },
      error: userError,
    } = await supabase.auth.getUser();

    if (userError) {
      setError(userError.message);
      setIsLoading(false);
      return;
    }

    if (!user) {
      router.replace('/auth/login');
      return;
    }

    const departmentNames = parseList(departments);
    const facilityRows = getCompletedFacilityDraftRows(facilities);
    const facilityNames = facilityRows.map((facility) => facility.name);
    const teamNames = createTeamsNow ? parseList(teams) : [];

    if (departmentNames.length === 0) {
      setError('Add at least one department.');
      setIsLoading(false);
      return;
    }

    const { data: setupData, error: rpcError } = await supabase.rpc('create_initial_club_setup', {
      p_club_name: clubName,
      p_city: city || null,
      p_country: country || null,
      p_department_names: departmentNames,
      p_facility_names: facilityNames,
      p_team_department_name: createTeamsNow ? selectedTeamDepartment || null : null,
      p_team_names: teamNames,
    });

    if (rpcError) {
      setError(rpcError.message);
      setIsLoading(false);
      return;
    }

    const setupResult = setupData as InitialClubSetupResult | null;
    const createdFacilitiesByName = new Map(
      (setupResult?.facilities ?? [])
        .filter((facility) => facility.id && facility.name)
        .map((facility) => [normalizeName(facility.name ?? ''), facility.id as string]),
    );

    const facilityAddressUpdates = facilityRows
      .filter((facility) => facility.address)
      .map((facility) => ({
        id: createdFacilitiesByName.get(normalizeName(facility.name)),
        address: facility.address,
      }))
      .filter((update): update is { id: string; address: string } => Boolean(update.id));

    if (facilityAddressUpdates.length > 0) {
      const updateResults = await Promise.all(
        facilityAddressUpdates.map((update) => supabase.from('facilities').update({ address: update.address }).eq('id', update.id)),
      );
      const updateError = updateResults.find((result) => result.error)?.error;

      if (updateError) {
        setError(updateError.message);
        setIsLoading(false);
        return;
      }
    }

    router.replace('/admin/overview');
  }

  return (
    <main className="os-page text-white">
      <div className="os-container max-w-5xl">
        <div className="os-hero">
          <div className="grid gap-5 lg:grid-cols-[1.2fr_0.8fr] lg:items-end">
            <div>
              <Link href="/onboarding" className="text-sm font-black text-slate-400 transition hover:text-sky-300">
                ← Back to onboarding
              </Link>
              <p className="os-kicker mt-5">Club Admin</p>
              <h1 className="os-title">Set up the operating layer.</h1>
            </div>
            <div className="grid grid-cols-2 gap-2 text-sm">
              <div className="os-metric"><p className="text-xs uppercase tracking-[0.16em] text-slate-500">Departments</p><p className="mt-1 text-2xl font-black">{departmentList.length}</p></div>
              <div className="os-metric"><p className="text-xs uppercase tracking-[0.16em] text-slate-500">Facilities</p><p className="mt-1 text-2xl font-black">{completedFacilityCount}</p></div>
              <div className="os-metric"><p className="text-xs uppercase tracking-[0.16em] text-slate-500">Teams now</p><p className="mt-1 text-2xl font-black">{teamCount}</p></div>
              <div className="os-metric"><p className="text-xs uppercase tracking-[0.16em] text-slate-500">Mode</p><p className="mt-1 text-sm font-black">{createTeamsNow ? 'Full start' : 'Lean start'}</p></div>
            </div>
          </div>
        </div>

        <section className="mt-5 grid gap-3 md:grid-cols-2">
          <button
            type="button"
            onClick={() => setCreateTeamsNow(false)}
            className={`rounded-3xl border p-5 text-left transition ${
              !createTeamsNow
                ? 'border-sky-300/60 bg-sky-300/10 ring-1 ring-sky-300/20'
                : 'border-slate-800/90 bg-slate-950/45 hover:border-sky-400/45'
            }`}
          >
            <p className="text-xs font-black uppercase tracking-[0.22em] text-sky-300">Lean start</p>
            <h2 className="mt-3 text-xl font-black">Departments first</h2>
            <p className="mt-3 text-sm font-bold text-slate-500">Create the club shell; teams can be added inside departments later.</p>
          </button>
          <button
            type="button"
            onClick={() => setCreateTeamsNow(true)}
            className={`rounded-3xl border p-5 text-left transition ${
              createTeamsNow
                ? 'border-emerald-300/60 bg-emerald-300/10 ring-1 ring-emerald-300/20'
                : 'border-slate-800/90 bg-slate-950/45 hover:border-emerald-400/45'
            }`}
          >
            <p className="text-xs font-black uppercase tracking-[0.22em] text-emerald-300">Team-ready</p>
            <h2 className="mt-3 text-xl font-black">Create first teams</h2>
            <p className="mt-3 text-sm font-bold text-slate-500">Best if one department already wants to start working immediately.</p>
          </button>
        </section>

        <form onSubmit={handleSubmit} className="mt-5 grid gap-5">
          <section className="os-section">
            <p className="text-xs font-black uppercase tracking-[0.2em] text-sky-300">Club</p>
            <h2 className="mt-2 text-xl font-black">Club basics</h2>
            <div className="mt-4 grid gap-4 md:grid-cols-3">
              <label className="block md:col-span-2">
                <span className="os-label">Club name</span>
                <input
                  required
                  value={clubName}
                  onChange={(event) => setClubName(event.target.value)}
                  className="os-field"
                  placeholder="TSV Example Club"
                />
              </label>
              <label className="block">
                <span className="os-label">Country</span>
                <input
                  value={country}
                  onChange={(event) => setCountry(event.target.value)}
                  className="os-field"
                  placeholder="Germany"
                />
              </label>
              <label className="block md:col-span-3">
                <span className="os-label">City</span>
                <input
                  value={city}
                  onChange={(event) => setCity(event.target.value)}
                  className="os-field"
                  placeholder="Munich"
                />
              </label>
            </div>
          </section>

          <section className="os-section">
            <p className="text-xs font-black uppercase tracking-[0.2em] text-violet-300">Departments</p>
            <h2 className="mt-2 text-xl font-black">Departments</h2>
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
              className="os-textarea mt-4 focus:border-violet-400 focus:ring-violet-400/10"
            />
          </section>

          <section className="os-section">
            <p className="text-xs font-black uppercase tracking-[0.2em] text-emerald-300">Facilities</p>
            <h2 className="mt-2 text-xl font-black">Facilities</h2>
            <FacilityRowsEditor facilities={facilities} onChange={setFacilities} />
          </section>

          <section className="os-section">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
              <div>
                <p className="text-xs font-black uppercase tracking-[0.2em] text-amber-300">Teams</p>
                <h2 className="mt-2 text-xl font-black">First teams</h2>
              </div>
              <label className="flex items-center gap-3 rounded-xl border border-slate-800 bg-slate-950/60 px-4 py-3 text-sm font-bold text-slate-200">
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
                  <span className="os-label">Department for these teams</span>
                  <select
                    value={selectedTeamDepartment}
                    onChange={(event) => setSelectedTeamDepartment(event.target.value)}
                    className="os-field focus:border-amber-400 focus:ring-amber-400/10"
                  >
                    {departmentList.map((department) => (
                      <option key={department} value={department}>
                        {department}
                      </option>
                    ))}
                  </select>
                </label>

                <label className="block">
                  <span className="os-label">Teams</span>
                  <textarea
                    value={teams}
                    onChange={(event) => setTeams(event.target.value)}
                    className="os-textarea focus:border-amber-400 focus:ring-amber-400/10"
                    placeholder="U14 Boys\nU16 Boys\nU18 Boys"
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
            disabled={isLoading}
            className="os-primary py-4"
          >
            {isLoading ? 'Creating club setup...' : 'Create club setup'}
          </button>
        </form>
      </div>
    </main>
  );
}
