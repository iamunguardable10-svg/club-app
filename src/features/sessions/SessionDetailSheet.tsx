'use client';

import { formatSessionTime } from '@/shared/format';
import { useEffect, useState, type ReactNode } from 'react';
import { useBodyScrollLock } from '@/shared/hooks/useBodyScrollLock';
import { LoadInfoButton, LoadRiskBadge } from '@/features/load/LoadHints';
import { useT, type MessageKey } from '@/shared/i18n';

const STATUS_KEY: Record<string, MessageKey> = {
  late: 'sessionSheet.status.late',
  out: 'sessionSheet.status.out',
  expected: 'sessionSheet.status.expected',
  present: 'sessionSheet.status.present',
};

export type SessionDetailGroup = {
  id: string;
  name: string;
  playerCount?: number;
};

export type SessionDetailFacilityOption = {
  id: string;
  name: string;
};

export type SessionDetailAttendance = {
  expected?: number;
  present?: number;
  late?: number;
  out?: number;
  status?: string;
  notes?: Array<{
    id: string;
    name: string;
    status: 'late' | 'out' | 'present';
    detail?: string | null;
  }>;
};

export type SessionDetailLoad = {
  reported?: number;
  missing?: number;
  planned?: number;
  status?: string;
};

/** A player this session would take above an ACWR of 1.5 (`after` null: already above, no forecast). */
export type SessionDetailLoadRisk = {
  id: string;
  name: string;
  before: number;
  after: number | null;
};

export type SessionDetailParticipant = {
  id: string;
  name: string;
  status?: 'expected' | 'late' | 'out' | 'present';
  detail?: string | null;
};

function formatTimeRange(startsAt: string, endsAt: string | null) {
  return formatSessionTime(startsAt, endsAt);
}

function statusClass(status?: string) {
  if (status === 'out') return 'text-red-200';
  if (status === 'late') return 'text-amber-200';
  return 'text-emerald-200';
}

function timeValueFromIso(value: string) {
  const date = new Date(value);
  return `${String(date.getHours()).padStart(2, '0')}:${String(date.getMinutes()).padStart(2, '0')}`;
}

export function SessionDetailSheet({
  title,
  startsAt,
  endsAt,
  teamName,
  departmentName,
  facilityName,
  facilityId,
  facilityOptions = [],
  canEditFacility = false,
  isSavingFacility = false,
  onFacilityChange,
  groups = [],
  selectedGroupIds = [],
  canEditGroups = false,
  onGroupsChange,
  attendance,
  load,
  loadRisks = [],
  participants = [],
  showExpectedParticipants = true,
  onParticipantSelect,
  insights,
  editDetails,
  editOpenKey,
  canEditTime = false,
  onTimeChange,
  actions,
  info,
  onClose,
}: {
  title: string;
  startsAt: string;
  endsAt: string | null;
  teamName?: string | null;
  departmentName?: string | null;
  facilityName?: string | null;
  facilityId?: string | null;
  facilityOptions?: SessionDetailFacilityOption[];
  canEditFacility?: boolean;
  isSavingFacility?: boolean;
  onFacilityChange?: (facilityId: string) => void | Promise<void>;
  groups?: SessionDetailGroup[];
  selectedGroupIds?: string[];
  canEditGroups?: boolean;
  onGroupsChange?: (groupIds: string[]) => void | Promise<void>;
  attendance?: SessionDetailAttendance;
  load?: SessionDetailLoad;
  loadRisks?: SessionDetailLoadRisk[];
  participants?: SessionDetailParticipant[];
  showExpectedParticipants?: boolean;
  onParticipantSelect?: (participantId: string) => void;
  insights?: ReactNode;
  editDetails?: ReactNode;
  editOpenKey?: string | null;
  canEditTime?: boolean;
  onTimeChange?: (startsAt: string, endsAt: string) => void | Promise<void>;
  actions?: ReactNode;
  /** Notes, meeting, opponent (piece 14), under the header. */
  info?: ReactNode;
  onClose: () => void;
}) {
  const t = useT();
  const statusLabel = (status?: string) => (status && STATUS_KEY[status] ? t(STATUS_KEY[status]) : status ?? t('sessionSheet.status.expected'));
  useBodyScrollLock(true);

  const wholeTeamSelected = selectedGroupIds.length === 0;
  const [showEditDetails, setShowEditDetails] = useState(false);
  const [showParticipants, setShowParticipants] = useState(false);
  const [isSavingTime, setIsSavingTime] = useState(false);
  const [mutationError, setMutationError] = useState<string | null>(null);
  const [timeValue, setTimeValue] = useState(() => timeValueFromIso(startsAt));
  const [endTimeValue, setEndTimeValue] = useState(() => timeValueFromIso(endsAt ?? new Date(new Date(startsAt).getTime() + 60 * 60_000).toISOString()));
  const expectedParticipants = participants.filter((player) => player.status !== 'out');
  const selectedGroups = selectedGroupIds.length > 0 ? groups.filter((group) => selectedGroupIds.includes(group.id)) : [];
  const contextLine = [teamName, departmentName, facilityName].filter(Boolean).join(' \u00b7 ');
  const attendanceExpected = attendance?.expected ?? participants.length;
  const attendanceOut = attendance?.out ?? participants.filter((player) => player.status === 'out').length;
  const attendanceLate = attendance?.late ?? participants.filter((player) => player.status === 'late').length;
  const expectedLabel = attendanceExpected > 0 ? t('sessionSheet.expected', { there: Math.max(0, attendanceExpected - attendanceOut), total: attendanceExpected }) : null;

  useEffect(() => {
    if (editOpenKey) setShowEditDetails(true);
  }, [editOpenKey]);

  async function saveGroupSelection(groupIds: string[]) {
    if (!onGroupsChange) return;
    setMutationError(null);
    try {
      await onGroupsChange(groupIds);
    } catch {
      setMutationError(t('sessionSheet.saveFailed'));
    }
  }

  function toggleGroup(groupId: string) {
    if (!onGroupsChange) return;
    const next = selectedGroupIds.includes(groupId)
      ? selectedGroupIds.filter((id) => id !== groupId)
      : [...selectedGroupIds, groupId];
    void saveGroupSelection(next);
  }


  async function saveTimeChange() {
    if (!onTimeChange) return;
    const [hours, minutes] = timeValue.split(':').map(Number);
    if (!Number.isFinite(hours) || !Number.isFinite(minutes)) return;
    const [endHours, endMinutes] = endTimeValue.split(':').map(Number);
    const start = new Date(startsAt);
    start.setHours(hours, minutes, 0, 0);
    const end = new Date(start);
    end.setHours(Number.isFinite(endHours) ? endHours : start.getHours(), Number.isFinite(endMinutes) ? endMinutes : start.getMinutes() + 60, 0, 0);
    const normalizedEnd = (end.getTime() - start.getTime()) / 60_000 < 30 ? new Date(start.getTime() + 30 * 60_000) : end;
    setIsSavingTime(true);
    try {
      await onTimeChange(start.toISOString(), normalizedEnd.toISOString());
      setShowEditDetails(false);
    } finally {
      setIsSavingTime(false);
    }
  }

  return (
    <div className="fixed inset-0 z-[100] flex items-end justify-center bg-slate-950/75 p-2.5 backdrop-blur-sm sm:items-center">
      <section className="max-h-[92vh] w-full max-w-2xl overflow-y-auto rounded-2xl border border-slate-800 bg-slate-950 p-3.5 text-white shadow-2xl sm:p-4">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <p className="text-[11px] font-black uppercase tracking-[0.16em] text-sky-300">{t('sessionSheet.kicker')}</p>
            <h3 className="mt-1.5 truncate text-xl font-black text-white sm:text-2xl">{title}</h3>
            <p className="mt-1 text-sm font-bold text-slate-400">{formatTimeRange(startsAt, endsAt)}</p>
            {contextLine ? <p className="mt-1 truncate text-xs font-bold text-slate-500">{contextLine}</p> : null}
          </div>
          <button type="button" onClick={onClose} className="shrink-0 rounded-lg border border-slate-700 px-2.5 py-1.5 text-xs font-black text-slate-200 hover:bg-slate-900 sm:text-sm">
            {t('sessionSheet.close')}
          </button>
        </div>
        {info ? <div className="mt-3">{info}</div> : null}

        <div className="mt-4 rounded-xl border border-slate-800 bg-slate-900/45 p-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <p className="text-[10px] font-black uppercase tracking-[0.16em] text-slate-500">{t('sessionSheet.participants')}</p>
            {expectedLabel ? (
              <span className="rounded-full border border-slate-700 bg-slate-950/60 px-2.5 py-1 text-[11px] font-black text-slate-300">
                {expectedLabel}{attendanceLate > 0 ? t('sessionSheet.lateSuffix', { count: attendanceLate }) : ''}
              </span>
            ) : null}
          </div>
          {canEditGroups && groups.length > 0 ? (
            <div className="mt-2.5 flex flex-wrap gap-1.5">
              <button
                type="button"
                disabled={!onGroupsChange}
                onClick={() => { void saveGroupSelection([]); }}
                className={`rounded-full border px-2.5 py-1 text-xs font-black ${wholeTeamSelected ? 'border-slate-100 bg-slate-100 text-slate-950' : 'border-slate-700 text-slate-300 hover:text-white'} disabled:opacity-70`}
              >
                {t('sessionSheet.wholeTeam')}
              </button>
              {groups.map((group) => {
                const selected = selectedGroupIds.includes(group.id);
                return (
                  <button
                    key={group.id}
                    type="button"
                    disabled={!onGroupsChange}
                    onClick={() => toggleGroup(group.id)}
                    className={`rounded-full border px-2.5 py-1 text-xs font-black ${selected ? 'border-sky-300 bg-sky-950/50 text-sky-100' : 'border-slate-700 text-slate-300 hover:text-white'} disabled:opacity-70`}
                  >
                    {group.name}{typeof group.playerCount === 'number' ? ` \u00b7 ${group.playerCount}` : ''}
                  </button>
                );
              })}
            </div>
          ) : selectedGroups.length > 0 ? (
            <div className="mt-2.5 flex flex-wrap gap-1.5">
              {selectedGroups.map((group) => (
                <span key={group.id} className="rounded-full border border-slate-700 bg-slate-950/60 px-2.5 py-1 text-xs font-black text-slate-200">
                  {group.name}{typeof group.playerCount === 'number' ? ` \u00b7 ${group.playerCount}` : ''}
                </span>
              ))}
            </div>
          ) : (
            <p className="mt-2.5 text-sm font-bold text-slate-400">{t('sessionSheet.wholeTeam')}</p>
          )}
        </div>

        {attendance?.notes && attendance.notes.length > 0 ? (
          <div className="mt-2.5 rounded-xl border border-slate-800 bg-slate-900/45 p-3">
            <p className="text-[10px] font-black uppercase tracking-[0.16em] text-slate-500">{t('sessionSheet.attendanceFlags')}</p>
            <div className="mt-2.5 grid gap-2">
              {attendance.notes.map((note) => {
                const className = `flex w-full items-center justify-between gap-3 rounded-xl border border-slate-800 bg-slate-950/60 px-3 py-2 text-left text-sm font-bold transition ${onParticipantSelect ? 'hover:border-emerald-300/50 hover:bg-slate-900' : ''}`;
                const content = (
                  <>
                    <span className="text-slate-100">{note.name}</span>
                    <span className={statusClass(note.status)}>{statusLabel(note.status)}{note.detail ? ` · ${note.detail}` : ''}</span>
                  </>
                );
                return onParticipantSelect ? (
                  <button key={note.id} type="button" onClick={() => onParticipantSelect(note.id)} className={className}>{content}</button>
                ) : (
                  <div key={note.id} className={className}>{content}</div>
                );
              })}
            </div>
          </div>
        ) : null}

        {insights ? (
          <div className="mt-2.5 rounded-xl border border-slate-800 bg-slate-900/45 p-3">
            {insights}
          </div>
        ) : null}


        {load ? (
          <div className="mt-2.5 rounded-xl border border-slate-800 bg-slate-900/45 p-3">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <p className="text-[10px] font-black uppercase tracking-[0.16em] text-slate-500">{t('sessionSheet.load')}</p>
              {load.status ? <span className="rounded-full border border-slate-700 px-2.5 py-1 text-xs font-black text-slate-200">{load.status}</span> : null}
            </div>
            <div className="mt-2.5 grid grid-cols-3 gap-2 text-center">
              {typeof load.reported === 'number' ? <div className="rounded-xl border border-slate-800 bg-slate-950/60 p-2"><p className="text-[10px] font-black uppercase tracking-[0.14em] text-slate-500">{t('sessionSheet.reported')}</p><p className="mt-1 text-lg font-black text-emerald-200">{load.reported}</p></div> : null}
              {typeof load.missing === 'number' ? <div className="rounded-xl border border-slate-800 bg-slate-950/60 p-2"><p className="text-[10px] font-black uppercase tracking-[0.14em] text-slate-500">{t('sessionSheet.missing')}</p><p className="mt-1 text-lg font-black text-amber-200">{load.missing}</p></div> : null}
              {typeof load.planned === 'number' ? <div className="rounded-xl border border-slate-800 bg-slate-950/60 p-2"><p className="text-[10px] font-black uppercase tracking-[0.14em] text-slate-500">{t('sessionSheet.planned')}</p><p className="mt-1 text-lg font-black text-slate-100">{load.planned}</p></div> : null}
            </div>
          </div>
        ) : null}

        {loadRisks.length > 0 ? (
          <div className="mt-2.5 rounded-xl border border-slate-800 bg-slate-900/45 p-3">
            <div className="flex items-center justify-between gap-2">
              <p className="text-[10px] font-black uppercase tracking-[0.16em] text-slate-500">{t('sessionSheet.loadRisk')}</p>
              <LoadInfoButton />
            </div>
            <div className="mt-2.5 grid gap-2">
              {loadRisks.map((risk) => (
                <div key={risk.id} className="flex items-center justify-between gap-3 rounded-xl border border-rose-400/25 bg-rose-400/[0.06] px-3 py-2 text-sm font-bold">
                  {onParticipantSelect ? (
                    <button type="button" onClick={() => onParticipantSelect(risk.id)} className="min-w-0 truncate text-left text-slate-100 underline-offset-2 hover:underline">{risk.name}</button>
                  ) : <span className="min-w-0 truncate text-slate-100">{risk.name}</span>}
                  <LoadRiskBadge before={risk.before} after={risk.after} />
                </div>
              ))}
            </div>
          </div>
        ) : null}

        {editDetails || (canEditTime && onTimeChange) ? (
          <div className="mt-2.5 rounded-xl border border-slate-800 bg-slate-900/45 p-3">
            <button
              type="button"
              onClick={() => setShowEditDetails((current) => !current)}
              className="rounded-lg border border-sky-500/55 px-2.5 py-1.5 text-xs font-black text-sky-100 hover:bg-sky-950/35"
            >
              {showEditDetails ? t('sessionSheet.hideTimeEdit') : editDetails ? t('sessionSheet.editSession') : t('sessionSheet.editTime')}
            </button>
            {showEditDetails ? (
              <div className="mt-3 space-y-3">
                {canEditTime && onTimeChange ? (
                  <div className="grid min-w-0 grid-cols-[4.35rem_4.35rem_auto] gap-2 sm:grid-cols-[7rem_7rem_auto] sm:items-end">
                    <label className="min-w-0 text-[10px] font-black uppercase tracking-[0.14em] text-slate-500 sm:text-xs sm:tracking-[0.16em]">
                      {t('sessionSheet.start')}
                      <input value={timeValue} onChange={(event) => setTimeValue(event.target.value)} type="time" className="mt-1 h-8 w-full min-w-0 appearance-none rounded-lg border border-slate-700/90 bg-slate-950 px-0.5 text-center text-[13px] font-black tracking-tight text-slate-100 outline-none transition focus:border-sky-300 sm:h-9 sm:px-2 sm:text-sm [color-scheme:dark]" />
                    </label>
                    <label className="min-w-0 text-[10px] font-black uppercase tracking-[0.14em] text-slate-500 sm:text-xs sm:tracking-[0.16em]">
                      {t('sessionSheet.end')}
                      <input value={endTimeValue} onChange={(event) => setEndTimeValue(event.target.value)} type="time" className="mt-1 h-8 w-full min-w-0 appearance-none rounded-lg border border-slate-700/90 bg-slate-950 px-0.5 text-center text-[13px] font-black tracking-tight text-slate-100 outline-none transition focus:border-sky-300 sm:h-9 sm:px-2 sm:text-sm [color-scheme:dark]" />
                    </label>
                    <button type="button" onClick={() => { void saveTimeChange(); }} disabled={isSavingTime} className="h-9 w-fit rounded-lg border border-emerald-300 bg-emerald-300 px-3 text-xs font-black text-slate-950 disabled:opacity-60">
                      {t('sessionSheet.save')}
                    </button>
                  </div>
                ) : null}
                {editDetails}
              </div>
            ) : null}
          </div>
        ) : null}

        {showExpectedParticipants && expectedParticipants.length > 0 ? (
          <div className="mt-2.5 rounded-xl border border-slate-800 bg-slate-900/45 p-3">
            <button type="button" onClick={() => setShowParticipants((current) => !current)} className="rounded-lg border border-slate-700 px-2.5 py-1.5 text-xs font-black text-slate-200 hover:bg-slate-900">
              {showParticipants ? t('sessionSheet.hideExpected') : t('sessionSheet.expectedPlayers', { count: expectedParticipants.length })}
            </button>
            {showParticipants ? (
              <div className="mt-2.5 grid gap-2 sm:grid-cols-2">
                {expectedParticipants.map((player) => {
                  const className = `flex w-full items-center justify-between gap-3 rounded-xl border border-slate-800 bg-slate-950/60 px-3 py-2 text-left text-sm font-bold transition ${onParticipantSelect ? 'hover:border-emerald-300/50 hover:bg-slate-900' : ''}`;
                  const content = (
                    <>
                      <span className="text-slate-100">{player.name}</span>
                      <span className={statusClass(player.status)}>{statusLabel(player.status)}{player.detail ? ` · ${player.detail}` : ''}</span>
                    </>
                  );
                  return onParticipantSelect ? (
                    <button key={player.id} type="button" onClick={() => onParticipantSelect(player.id)} className={className}>{content}</button>
                  ) : (
                    <div key={player.id} className={className}>{content}</div>
                  );
                })}
              </div>
            ) : null}
          </div>
        ) : null}



        {mutationError ? <p className="mt-3 rounded-xl border border-rose-400/30 bg-rose-400/10 px-3 py-2 text-sm font-bold text-rose-100">{mutationError}</p> : null}

        {actions ? <div className="mt-4 flex flex-wrap justify-end gap-2">{actions}</div> : null}
      </section>
    </div>
  );
}
