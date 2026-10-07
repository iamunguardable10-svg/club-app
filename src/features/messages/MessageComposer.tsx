'use client';

/**
 * Writing a message (pieces 17, B, C; step 2 of the messages plan): who it
 * goes to in one "To:" line, like a mail. "+ Recipients" opens everything the
 * writer may address — the whole club, departments, own teams and their
 * groups — and a choice of everyone, only the staff or only the players.
 * A wider choice covers the narrower ones (club > department > team), so
 * those are no longer offered once it is chosen. A team means the whole team
 * until some of its groups are chosen under it.
 * Below the text: poll and important. The line under the text says how many
 * people it reaches; someone reached twice counts once. With the club server
 * the server counts them: a department lead does not see the players.
 */

import { useEffect, useState } from 'react';

import {
  DEFAULT_MESSAGE_PIN_DAYS,
  getActivePerson,
  isRemoteMode,
  MESSAGE_PIN_DAYS,
  messageRecipientIds,
  messageTargetsFor,
  POLL_MAX_OPTIONS,
  POLL_MIN_OPTIONS,
  POLL_OPTION_MAX_LENGTH,
  postMessage,
  serverMessageReach,
  useLocalDatabase,
  type Id,
  type MessageAudience,
} from '@/shared/data';
import { errorText, useT } from '@/shared/i18n';

type Targets = { teamIds: Id[]; groupIds: Id[]; departmentIds: Id[]; wholeClub: boolean };

const EMPTY: Targets = { teamIds: [], groupIds: [], departmentIds: [], wholeClub: false };

const toggle = (list: Id[], id: Id) => (list.includes(id) ? list.filter((other) => other !== id) : [...list, id]);

export function MessageComposer({ initialTeamIds = [] }: { initialTeamIds?: Id[] }) {
  const t = useT();
  const { database } = useLocalDatabase();
  const person = database ? getActivePerson(database) : null;
  const allowed = database ? messageTargetsFor(database, person?.id ?? null) : { teamIds: [], departmentIds: [], wholeClub: false };
  // With only one team to write to, it is chosen already.
  const onlyTeam = allowed.teamIds.length === 1 && allowed.departmentIds.length === 0 && !allowed.wholeClub ? allowed.teamIds : [];
  const startTeams = initialTeamIds.filter((id) => allowed.teamIds.includes(id));
  // Until the writer changes it, the "To:" follows what is loaded (the data can arrive after the first paint).
  const [picked, setTargets] = useState<Targets | null>(null);
  const targets = picked ?? { ...EMPTY, teamIds: startTeams.length > 0 ? startTeams : onlyTeam };
  const [audience, setAudience] = useState<MessageAudience>('all');
  const [picking, setPicking] = useState(false);
  const [body, setBody] = useState('');
  const [important, setImportant] = useState(false);
  const [pinDays, setPinDays] = useState<number>(DEFAULT_MESSAGE_PIN_DAYS);
  const [poll, setPoll] = useState(false);
  const [pollOptions, setPollOptions] = useState<string[]>(['', '']);
  const [pollMultiple, setPollMultiple] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [serverReach, setServerReach] = useState<{ key: string; count: number | null } | null>(null);
  const reachKey = JSON.stringify([targets.teamIds, targets.groupIds, targets.departmentIds, targets.wholeClub, audience]);
  const clubId = database?.club.id ?? null;
  const remote = isRemoteMode();
  useEffect(() => {
    if (!remote || !clubId) return;
    let current = true;
    const timer = window.setTimeout(() => {
      const [teamIds, groupIds, departmentIds, wholeClub, chosenAudience] = JSON.parse(reachKey) as [Id[], Id[], Id[], boolean, MessageAudience];
      void serverMessageReach(clubId, { teamIds, groupIds, departmentIds, wholeClub }, chosenAudience).then((count) => {
        if (current) setServerReach({ key: reachKey, count });
      });
    }, 250);
    return () => {
      current = false;
      window.clearTimeout(timer);
    };
  }, [remote, clubId, reachKey]);
  if (!database || !person) return null;
  const canWrite = allowed.wholeClub || allowed.departmentIds.length > 0 || allowed.teamIds.length > 0;
  if (!canWrite) return null;

  const teamName = (id: Id) => database.teams.find((team) => team.id === id)?.name ?? '';
  const departmentName = (id: Id) => database.departments.find((department) => department.id === id)?.name ?? '';
  const groupsOf = (teamId: Id) => database.playerGroups.filter((group) => group.teamId === teamId).sort((a, b) => a.name.localeCompare(b.name));
  const groupLabel = (id: Id) => {
    const group = database.playerGroups.find((candidate) => candidate.id === id);
    return group ? `${teamName(group.teamId)} (${group.name})` : '';
  };
  const departmentOf = (teamId: Id) => database.teams.find((team) => team.id === teamId)?.departmentId ?? null;
  const groupTeam = (groupId: Id) => database.playerGroups.find((group) => group.id === groupId)?.teamId ?? null;
  // A wider choice covers the narrower ones: the whole club covers every
  // department and team, a department its teams, a team its groups. Those are
  // neither offered nor kept once the wider one is chosen.
  const teamCovered = (teamId: Id) => targets.wholeClub || targets.departmentIds.includes(departmentOf(teamId) ?? '');
  const chooseClub = () => setTargets(targets.wholeClub ? { ...targets, wholeClub: false } : { ...EMPTY, wholeClub: true });
  const chooseDepartment = (id: Id) => {
    if (targets.departmentIds.includes(id)) {
      setTargets({ ...targets, departmentIds: toggle(targets.departmentIds, id) });
      return;
    }
    const inside = (teamId: Id | null) => teamId !== null && departmentOf(teamId) === id;
    setTargets({
      ...targets,
      departmentIds: [...targets.departmentIds, id],
      teamIds: targets.teamIds.filter((teamId) => !inside(teamId)),
      groupIds: targets.groupIds.filter((groupId) => !inside(groupTeam(groupId))),
    });
  };
  // A team is chosen first and means the whole team; its groups then appear
  // to narrow it down. Choosing groups replaces the whole team by them, and
  // taking the last group away gives the whole team back.
  const teamChosen = (id: Id) => targets.teamIds.includes(id) || targets.groupIds.some((groupId) => groupTeam(groupId) === id);
  const chooseTeam = (id: Id) => setTargets(teamChosen(id)
    ? { ...targets, teamIds: targets.teamIds.filter((teamId) => teamId !== id), groupIds: targets.groupIds.filter((groupId) => groupTeam(groupId) !== id) }
    : { ...targets, teamIds: [...targets.teamIds, id] });
  const chooseGroup = (groupId: Id) => {
    const teamId = groupTeam(groupId);
    if (!teamId) return;
    if (targets.groupIds.includes(groupId)) {
      const groupIds = targets.groupIds.filter((other) => other !== groupId);
      const lastOne = !groupIds.some((other) => groupTeam(other) === teamId);
      setTargets({ ...targets, groupIds, teamIds: lastOne ? [...targets.teamIds, teamId] : targets.teamIds });
    } else {
      setTargets({ ...targets, groupIds: [...targets.groupIds, groupId], teamIds: targets.teamIds.filter((other) => other !== teamId) });
    }
  };
  const offeredTeams = allowed.teamIds.filter((id) => !teamCovered(id));
  const chosen = targets.wholeClub || targets.teamIds.length + targets.groupIds.length + targets.departmentIds.length > 0;
  const localReach = chosen ? messageRecipientIds(database, { ...targets, audience, authorId: person.id }).length : 0;
  // The server's count once it answered (or this one when it cannot); until then none.
  const reach = !remote ? localReach : serverReach?.key === reachKey ? serverReach.count ?? localReach : null;
  const pollReady = !poll || pollOptions.filter((option) => option.trim()).length >= POLL_MIN_OPTIONS;

  function send() {
    try {
      postMessage({ ...targets, audience, body, important, pinDays, poll: poll ? { options: pollOptions, multiple: pollMultiple } : null });
      setBody('');
      setPoll(false);
      setPollOptions(['', '']);
      setPollMultiple(false);
      setImportant(false);
      setPinDays(DEFAULT_MESSAGE_PIN_DAYS);
      setAudience('all');
      setPicking(false);
      setError(null);
    } catch (caught) {
      setError(errorText(t, caught));
    }
  }

  const chip = (key: string, label: string, onRemove: () => void) => (
    <span key={key} className="inline-flex items-center gap-1 rounded-full border border-sky-300/60 bg-sky-950/50 py-0.5 pl-2.5 pr-1 text-xs font-black text-sky-100">
      {label}
      <button type="button" onClick={onRemove} aria-label={t('writeMessage.remove', { name: label })} className="grid h-5 w-5 place-items-center rounded-full text-sky-200 hover:bg-sky-900">×</button>
    </span>
  );
  const option = (key: string, label: string, on: boolean, onToggle: () => void, small = false) => (
    <button
      key={key}
      type="button"
      data-message-group={key.startsWith('g') ? key.slice(1) : undefined}
      data-message-team={key.startsWith('t') ? key.slice(1) : undefined}
      aria-pressed={on}
      onClick={onToggle}
      className={`rounded-full border font-black transition ${small ? 'px-2 py-0.5 text-[11px]' : 'px-2.5 py-1 text-xs'} ${on ? 'border-sky-300 bg-sky-300 text-slate-950' : 'border-slate-700 text-slate-300 hover:border-slate-500'}`}
    >
      {label}
    </button>
  );

  return (
    <form className="grid gap-2 rounded-2xl border border-slate-800 bg-slate-950/60 p-3" onSubmit={(event) => { event.preventDefault(); send(); }}>
      <div data-tour="compose-to" className="flex flex-wrap items-center gap-1.5">
        <span className="text-xs font-black text-slate-400">{t('writeMessage.to')}</span>
        {targets.wholeClub ? chip('club', database.club.name, () => setTargets({ ...targets, wholeClub: false })) : null}
        {targets.departmentIds.map((id) => chip(`d${id}`, departmentName(id), () => setTargets({ ...targets, departmentIds: toggle(targets.departmentIds, id) })))}
        {targets.teamIds.map((id) => chip(`t${id}`, teamName(id), () => setTargets({ ...targets, teamIds: toggle(targets.teamIds, id) })))}
        {targets.groupIds.map((id) => chip(`g${id}`, groupLabel(id), () => chooseGroup(id)))}
        <button type="button" onClick={() => setPicking((value) => !value)} aria-expanded={picking} className="rounded-full border border-dashed border-slate-600 px-2.5 py-0.5 text-xs font-black text-slate-300 hover:border-slate-400 hover:text-white">
          {picking ? t('writeMessage.done') : t('writeMessage.addRecipients')}
        </button>
      </div>

      {picking ? (
        <div data-tour="compose-recipients" className="grid gap-3 rounded-xl border border-slate-800 bg-slate-950/70 p-3">
          {allowed.wholeClub || allowed.departmentIds.length > 0 ? (
            <div className="grid gap-1.5">
              <p className="text-[10px] font-black uppercase tracking-[0.14em] text-slate-500">{t('writeMessage.clubAndDepartments')}</p>
              <div className="flex flex-wrap gap-1.5">
                {allowed.wholeClub ? option('club', t('writeMessage.wholeClub'), targets.wholeClub, chooseClub) : null}
                {targets.wholeClub ? null : allowed.departmentIds.map((id) => option(`d${id}`, departmentName(id), targets.departmentIds.includes(id), () => chooseDepartment(id)))}
              </div>
            </div>
          ) : null}
          {targets.wholeClub ? <p className="text-xs text-slate-400">{t('writeMessage.coversAll')}</p> : null}
          {offeredTeams.length > 0 ? (
            <div className="grid gap-1.5">
              <p className="text-[10px] font-black uppercase tracking-[0.14em] text-slate-500">{t('writeMessage.teams')}</p>
              <div className="grid gap-2">
                {offeredTeams.map((id) => (
                  <div key={id} className="grid gap-1.5">
                    <div>{option(`t${id}`, teamName(id), teamChosen(id), () => chooseTeam(id))}</div>
                    {teamChosen(id) && groupsOf(id).length > 0 ? (
                      <div className="ml-3 flex flex-wrap items-center gap-1.5 border-l border-slate-800 pl-3">
                        <span className="text-[11px] font-bold text-slate-500">{t('writeMessage.onlyGroups')}</span>
                        {groupsOf(id).map((group) => option(`g${group.id}`, group.name, targets.groupIds.includes(group.id), () => chooseGroup(group.id), true))}
                      </div>
                    ) : null}
                  </div>
                ))}
              </div>
            </div>
          ) : null}
        </div>
      ) : null}

      <div role="radiogroup" data-tour="compose-who" aria-label={t('writeMessage.who')} className="flex flex-wrap items-center gap-1.5">
        <span className="text-xs font-black text-slate-400">{t('writeMessage.who')}</span>
        {(['all', 'staff', 'players'] as const).map((value) => (
          <button
            key={value}
            type="button"
            role="radio"
            aria-checked={audience === value}
            onClick={() => setAudience(value)}
            className={`rounded-full border px-2.5 py-0.5 text-xs font-black ${audience === value ? 'border-slate-100 bg-slate-100 text-slate-950' : 'border-slate-700 text-slate-300'}`}
          >
            {t(value === 'all' ? 'writeMessage.audience.all' : value === 'staff' ? 'writeMessage.audience.staff' : 'writeMessage.audience.players')}
          </button>
        ))}
      </div>

      <div data-tour="compose-body" className="grid gap-2">
      <textarea
        data-tour="compose-text"
        value={body}
        onChange={(event) => { setBody(event.target.value); setError(null); }}
        maxLength={2000}
        rows={3}
        placeholder={poll ? t('poll.questionPlaceholder') : t('writeMessage.placeholder')}
        aria-label={poll ? t('poll.question') : t('teamMessages.newMessage')}
        className="os-field min-h-20 resize-y"
      />
      </div>
      {poll ? (
        <div className="grid gap-1.5">
          {pollOptions.map((value, index) => (
            <div key={index} className="flex items-center gap-1.5">
              <input
                value={value}
                onChange={(event) => { const next = [...pollOptions]; next[index] = event.target.value; setPollOptions(next); setError(null); }}
                maxLength={POLL_OPTION_MAX_LENGTH}
                placeholder={t('poll.answerPlaceholder', { number: index + 1 })}
                aria-label={t('poll.answerPlaceholder', { number: index + 1 })}
                className="os-field min-w-0 flex-1 py-2 text-sm"
              />
              {pollOptions.length > POLL_MIN_OPTIONS ? (
                <button type="button" onClick={() => setPollOptions(pollOptions.filter((_, other) => other !== index))} aria-label={t('poll.removeAnswer')} className="grid h-9 w-9 shrink-0 place-items-center rounded-xl border border-slate-700 text-slate-400 hover:text-white">×</button>
              ) : null}
            </div>
          ))}
          <div className="flex flex-wrap items-center gap-x-4 gap-y-1.5">
            {pollOptions.length < POLL_MAX_OPTIONS ? (
              <button type="button" onClick={() => setPollOptions([...pollOptions, ''])} className="text-xs font-black text-violet-200 underline">{t('poll.addAnswer')}</button>
            ) : null}
            <label className="flex items-center gap-2 text-xs font-black text-slate-200">
              <input type="checkbox" checked={pollMultiple} onChange={(event) => setPollMultiple(event.target.checked)} className="h-4 w-4 accent-violet-300" />
              {t('poll.allowMultiple')}
            </label>
          </div>
        </div>
      ) : null}
      <div className="flex flex-wrap items-center justify-end gap-3">
        <label data-tour="compose-poll" className="flex items-center gap-2 text-xs font-black text-violet-100">
          <input type="checkbox" checked={poll} onChange={(event) => { setPoll(event.target.checked); setError(null); }} className="h-4 w-4 accent-violet-300" />
          {t('poll.label')}
        </label>
        <label data-tour="compose-important" className="flex items-center gap-2 text-xs font-black text-rose-100">
          <input type="checkbox" checked={important} onChange={(event) => setImportant(event.target.checked)} className="h-4 w-4 accent-rose-300" />
          {t('teamMessages.important')}
        </label>
      </div>
      {important ? (
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5">
          <select value={pinDays} onChange={(event) => setPinDays(Number(event.target.value))} aria-label={t('teamMessages.pinFor')} className="rounded-xl border border-rose-300/40 bg-slate-950 px-2.5 py-1.5 text-xs font-black text-rose-100">
            {MESSAGE_PIN_DAYS.map((days) => (
              <option key={days} value={days}>{t('teamMessages.pinFor')} {days % 7 === 0 ? t('teamMessages.pinWeeks', { count: days / 7 }) : t('teamMessages.pinDays', { count: days })}</option>
            ))}
          </select>
          <p className="text-xs text-slate-400">{t('teamMessages.importantHint')}</p>
        </div>
      ) : null}
      {error ? <p role="alert" className="text-xs font-bold text-red-200">{error}</p> : null}
      <div className="flex flex-wrap items-center gap-3">
        <button data-tour="compose-send" type="submit" disabled={!chosen || !body.trim() || !pollReady} className="rounded-xl bg-emerald-300 px-4 py-2 text-xs font-black text-slate-950 disabled:opacity-50">{t('writeMessage.send')}</button>
        <span className="text-xs font-bold text-slate-400">{!chosen ? t('writeMessage.chooseRecipients') : reach === null ? '…' : t('writeMessage.reach', { count: reach })}</span>
      </div>
    </form>
  );
}
