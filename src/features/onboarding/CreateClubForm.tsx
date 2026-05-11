'use client';

import { useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { createBrowserSupabaseClient } from '@/shared/lib/supabase/client';

function parseList(value: string) {
  return value
    .split('\n')
    .map((item) => item.trim())
    .filter(Boolean);
}

export function CreateClubForm() {
  const router = useRouter();
  const [clubName, setClubName] = useState('');
  const [city, setCity] = useState('');
  const [country, setCountry] = useState('Germany');
  const [departments, setDepartments] = useState('Basketball\nFootball\nFencing');
  const [facilities, setFacilities] = useState('Main Hall\nCourt 1\nCourt 2\nWeight Room');
  const [selectedTeamDepartment, setSelectedTeamDepartment] = useState('Basketball');
  const [teams, setTeams] = useState('U14 Boys\nU16 Boys\nU18 Boys\nFirst Team');
  const [createTeamsNow, setCreateTeamsNow] = useState(true);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const departmentList = useMemo(() => parseList(departments), [departments]);

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
    const facilityNames = parseList(facilities);
    const teamNames = createTeamsNow ? parseList(teams) : [];

    if (departmentNames.length === 0) {
      setError('Add at least one department.');
      setIsLoading(false);
      return;
    }

    const { error: rpcError } = await supabase.rpc('create_initial_club_setup', {
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

    router.replace('/admin/overview');
  }

  return (
    <main className="min-h-screen bg-[radial-gradient(circle_at_top,#172554_0,#070A12_45%)] px-4 py-8 text-white sm:px-8">
      <div className="mx-auto max-w-5xl">
        <div className="rounded-3xl border border-slate-800 bg-slate-950/75 p-6 shadow-sm">
          <p className="text-xs font-black uppercase tracking-[0.24em] text-sky-300">Admin onboarding</p>
          <h1 className="mt-3 text-3xl font-black tracking-tight sm:text-5xl">Set up your club</h1>
          <p className="mt-4 max-w-3xl text-sm leading-6 text-slate-400">
            Create the first club structure. Start with the club, departments and global facilities. Teams are optional here because department leads can create them later.
          </p>
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
                  placeholder="TSV Example Club"
                />
              </label>
              <label className="block">
                <span className="text-sm font-bold text-slate-200">Country</span>
                <input
                  value={country}
                  onChange={(event) => setCountry(event.target.value)}
                  className="mt-2 w-full rounded-xl border border-slate-700 bg-slate-900 px-4 py-3 text-sm outline-none focus:border-sky-400"
                  placeholder="Germany"
                />
              </label>
              <label className="block md:col-span-3">
                <span className="text-sm font-bold text-slate-200">City</span>
                <input
                  value={city}
                  onChange={(event) => setCity(event.target.value)}
                  className="mt-2 w-full rounded-xl border border-slate-700 bg-slate-900 px-4 py-3 text-sm outline-none focus:border-sky-400"
                  placeholder="Munich"
                />
              </label>
            </div>
          </section>

          <section className="rounded-3xl border border-slate-800 bg-slate-950/70 p-5">
            <p className="text-xs font-black uppercase tracking-[0.2em] text-violet-300">Step 2</p>
            <h2 className="mt-2 text-xl font-black">Departments</h2>
            <p className="mt-2 text-sm leading-6 text-slate-400">Add one department per line. You can add more later.</p>
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
            <p className="mt-2 text-sm leading-6 text-slate-400">Add the club's halls, courts, rooms or locations. Department scoping comes after setup.</p>
            <textarea
              value={facilities}
              onChange={(event) => setFacilities(event.target.value)}
              className="mt-4 min-h-36 w-full rounded-xl border border-slate-700 bg-slate-900 px-4 py-3 text-sm outline-none focus:border-emerald-400"
            />
          </section>

          <section className="rounded-3xl border border-slate-800 bg-slate-950/70 p-5">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
              <div>
                <p className="text-xs font-black uppercase tracking-[0.2em] text-amber-300">Optional step</p>
                <h2 className="mt-2 text-xl font-black">Create first teams now</h2>
                <p className="mt-2 max-w-2xl text-sm leading-6 text-slate-400">
                  You can create teams now, or leave this to department leads later. Both workflows are supported.
                </p>
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
            className="rounded-2xl bg-sky-400 px-5 py-4 text-sm font-black text-slate-950 transition hover:bg-sky-300 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {isLoading ? 'Creating club setup...' : 'Create club setup'}
          </button>
        </form>
      </div>
    </main>
  );
}
