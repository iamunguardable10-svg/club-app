'use client';

import { useMemo } from 'react';
import type {
  SeriesTemplate,
  SeriesWeekItem,
} from './sessionSeriesPlanner';
import { labelForCoachSessionType } from './sessionTypeLabels';

const weekdayOrder = [
  { key: 'monday', index: 1, short: 'Mo', label: 'Monday' },
  { key: 'tuesday', index: 2, short: 'Tu', label: 'Tuesday' },
  { key: 'wednesday', index: 3, short: 'We', label: 'Wednesday' },
  { key: 'thursday', index: 4, short: 'Th', label: 'Thursday' },
  { key: 'friday', index: 5, short: 'Fr', label: 'Friday' },
  { key: 'saturday', index: 6, short: 'Sa', label: 'Saturday' },
  { key: 'sunday', index: 0, short: 'Su', label: 'Sunday' },
] as const;

type WeekdayKey = (typeof weekdayOrder)[number]['key'];
type WeeklySeriesBoardTemplate = SeriesTemplate | SeriesWeekItem;
type ViewTemplate = WeeklySeriesBoardTemplate & Record<string, unknown>;

type WeekChangeDirection = 'previous' | 'next' | 'current';

export type WeeklySeriesBoardProps = {
  weekStart: Date | string;
  templates: WeeklySeriesBoardTemplate[];
  selectedTemplateIds?: string[];
  isConfirming?: boolean;
  onAddTemplate?: (weekday: number) => void;
  onEditTemplate?: (template: WeeklySeriesBoardTemplate) => void;
  onToggleSeriesForWeek?: (templateId: string, checked: boolean) => void;
  onConfirmWeek?: () => void;
  onWeekChange?: (direction: WeekChangeDirection, nextWeekStart: Date) => void;
};

function asDate(value: Date | string) {
  return value instanceof Date ? new Date(value) : new Date(`${value}T00:00:00`);
}

function startOfMondayWeek(value: Date | string) {
  const date = asDate(value);
  const day = date.getDay();
  const mondayOffset = day === 0 ? -6 : 1 - day;
  date.setHours(0, 0, 0, 0);
  date.setDate(date.getDate() + mondayOffset);
  return date;
}

function addDays(date: Date, days: number) {
  const next = new Date(date);
  next.setDate(next.getDate() + days);
  return next;
}

function sameDate(first: Date, second: Date) {
  return first.getFullYear() === second.getFullYear() && first.getMonth() === second.getMonth() && first.getDate() === second.getDate();
}

function formatWeekRange(weekStart: Date) {
  const weekEnd = addDays(weekStart, 6);
  const formatter = new Intl.DateTimeFormat(undefined, { day: '2-digit', month: 'short' });
  return `${formatter.format(weekStart)} - ${formatter.format(weekEnd)}`;
}

function formatDayDate(weekStart: Date, dayIndex: number) {
  const date = addDays(weekStart, dayIndex);
  return new Intl.DateTimeFormat(undefined, { day: '2-digit', month: '2-digit' }).format(date);
}

function templateId(template: WeeklySeriesBoardTemplate) {
  const view = template as ViewTemplate;
  return String(view.id ?? view.templateId ?? view.seriesTemplateId ?? '');
}

function templateWeekday(template: WeeklySeriesBoardTemplate): WeekdayKey {
  const view = template as ViewTemplate;
  const raw: unknown = view.weekday ?? view.dayOfWeek ?? view.weekdayIndex ?? view.day;
  if (typeof raw === 'string') {
    const normalized = raw.toLowerCase();
    const match = weekdayOrder.find((day) => day.key === normalized || day.short.toLowerCase() === normalized.slice(0, 2));
    if (match) return match.key;
  }
  if (typeof raw === 'number') {
    return weekdayOrder.find((day) => day.index === raw)?.key ?? 'monday';
  }
  return 'monday';
}

function templateTime(template: WeeklySeriesBoardTemplate, key: 'start' | 'end') {
  const view = template as ViewTemplate;
  const value: unknown = key === 'start'
    ? view.startTime ?? view.startsAt ?? view.start_at ?? view.start
    : view.endTime ?? view.endsAt ?? view.end_at ?? view.end;
  if (value instanceof Date) return new Intl.DateTimeFormat(undefined, { hour: '2-digit', minute: '2-digit' }).format(value);
  if (typeof value !== 'string') return key === 'start' ? '—' : '';
  if (value.includes('T')) return new Intl.DateTimeFormat(undefined, { hour: '2-digit', minute: '2-digit' }).format(new Date(value));
  return value.slice(0, 5);
}

function stringFrom(template: WeeklySeriesBoardTemplate, keys: string[], fallback = '—') {
  const view = template as ViewTemplate;
  for (const key of keys) {
    const value = view[key];
    if (typeof value === 'string' && value.trim()) return value;
    if (value && typeof value === 'object' && 'name' in value && typeof value.name === 'string') return value.name;
  }
  return fallback;
}

function participantsSummary(template: WeeklySeriesBoardTemplate) {
  const view = template as ViewTemplate;
  const direct = view.participantsSummary ?? view.participantSummary ?? view.audienceSummary;
  if (typeof direct === 'string' && direct.trim()) return direct;

  const groups = view.groups ?? view.participantGroups ?? view.selectedGroups;
  if (Array.isArray(groups) && groups.length > 0) {
    return groups
      .map((group) => (group && typeof group === 'object' && 'name' in group && typeof group.name === 'string' ? group.name : String(group)))
      .slice(0, 2)
      .join(', ') + (groups.length > 2 ? ` +${groups.length - 2}` : '');
  }

  const count = view.participantCount ?? view.playerCount ?? view.expectedParticipants;
  if (typeof count === 'number') return `${count} participants`;
  if (Array.isArray(view.groupIds) && view.groupIds.length > 0) return `${view.groupIds.length} groups`;
  return 'All team';
}

function sessionTypeLabel(template: WeeklySeriesBoardTemplate) {
  const view = template as ViewTemplate;
  const value = view.sessionType ?? view.type ?? view.session_type;
  return labelForCoachSessionType(typeof value === 'string' ? value : 'training');
}

function templateHasCreatedSession(template: WeeklySeriesBoardTemplate) {
  const view = template as ViewTemplate;
  return Boolean(
    view.committedSessionId
      || view.createdSessionId
      || view.sessionId
      || view.created_session_id
      || view.session_id,
  );
}

function templateChecked(template: WeeklySeriesBoardTemplate, selectedIds: Set<string>, hasControlledSelection: boolean) {
  const view = template as ViewTemplate;
  if (typeof view.checked === 'boolean' && !hasControlledSelection) return view.checked;
  return selectedIds.has(templateId(template));
}

export function WeeklySeriesBoard({
  weekStart,
  templates,
  selectedTemplateIds,
  isConfirming = false,
  onAddTemplate,
  onEditTemplate,
  onToggleSeriesForWeek,
  onConfirmWeek,
  onWeekChange,
}: WeeklySeriesBoardProps) {
  const monday = useMemo(() => startOfMondayWeek(weekStart), [weekStart]);
  const selectedIds = useMemo(() => new Set(selectedTemplateIds ?? []), [selectedTemplateIds]);
  const hasControlledSelection = selectedTemplateIds !== undefined;
  const groupedTemplates = useMemo(() => {
    const groups: Record<WeekdayKey, WeeklySeriesBoardTemplate[]> = {
      monday: [],
      tuesday: [],
      wednesday: [],
      thursday: [],
      friday: [],
      saturday: [],
      sunday: [],
    };

    templates.forEach((template) => {
      groups[templateWeekday(template)].push(template);
    });

    Object.values(groups).forEach((dayTemplates) => {
      dayTemplates.sort((first, second) => templateTime(first, 'start').localeCompare(templateTime(second, 'start')));
    });

    return groups;
  }, [templates]);

  const actionableCount = templates.filter((template) => {
    return templateChecked(template, selectedIds, hasControlledSelection) && !templateHasCreatedSession(template);
  }).length;
  const isCurrentWeek = sameDate(monday, startOfMondayWeek(new Date()));

  function changeWeek(direction: WeekChangeDirection) {
    if (!onWeekChange) return;
    const nextWeekStart = direction === 'current' ? startOfMondayWeek(new Date()) : addDays(monday, direction === 'previous' ? -7 : 7);
    onWeekChange(direction, nextWeekStart);
  }

  return (
    <section className="rounded-3xl border border-slate-800/90 bg-slate-950/70 p-3 text-slate-100 shadow-2xl shadow-slate-950/30 ring-1 ring-white/[0.03] sm:p-4">
      <div className="flex flex-col gap-3 border-b border-slate-800/80 pb-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="min-w-0">
          <p className="text-[10px] font-black uppercase tracking-[0.2em] text-slate-500">Weekly series</p>
          <div className="mt-2 flex flex-wrap items-center gap-2">
            <button type="button" onClick={() => changeWeek('previous')} disabled={!onWeekChange} className="grid h-8 w-8 place-items-center rounded-full border border-slate-700 bg-slate-950/70 text-sm font-black text-slate-200 transition hover:border-slate-500 disabled:cursor-not-allowed disabled:opacity-40" aria-label="Previous week">‹</button>
            <span className="rounded-full border border-slate-800 bg-slate-950/80 px-3 py-1.5 text-xs font-black text-slate-200">{formatWeekRange(monday)}</span>
            <button type="button" onClick={() => changeWeek('next')} disabled={!onWeekChange} className="grid h-8 w-8 place-items-center rounded-full border border-slate-700 bg-slate-950/70 text-sm font-black text-slate-200 transition hover:border-slate-500 disabled:cursor-not-allowed disabled:opacity-40" aria-label="Next week">›</button>
            <button type="button" onClick={() => changeWeek('current')} disabled={!onWeekChange || isCurrentWeek} className="rounded-full border border-slate-700 bg-slate-950/70 px-3 py-1.5 text-xs font-black text-slate-200 transition hover:border-emerald-300/70 disabled:cursor-not-allowed disabled:opacity-40">Current</button>
          </div>
        </div>

        <button
          type="button"
          onClick={onConfirmWeek}
          disabled={!onConfirmWeek || actionableCount === 0 || isConfirming}
          className="w-full rounded-2xl bg-emerald-300 px-4 py-3 text-sm font-black text-slate-950 transition hover:bg-emerald-200 disabled:cursor-not-allowed disabled:opacity-50 sm:w-fit"
        >
          {isConfirming ? 'Creating sessions' : 'Confirm week'}
        </button>
      </div>

      <div className="mt-3 grid gap-0 lg:grid-cols-7 lg:gap-3">
        {weekdayOrder.map((day, dayIndex) => {
          const dayTemplates = groupedTemplates[day.key];
          return (
            <section key={day.key} className="border-b border-slate-800/80 py-3 last:border-b-0 lg:rounded-2xl lg:border lg:border-slate-800/90 lg:bg-slate-950/45 lg:p-3 lg:ring-1 lg:ring-white/[0.03]">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <p className="text-sm font-black text-white">{day.short}</p>
                  <p className="mt-0.5 text-[11px] font-bold text-slate-500">{formatDayDate(monday, dayIndex)}</p>
                </div>
                {onAddTemplate ? (
                  <button type="button" onClick={() => onAddTemplate(day.index)} className="rounded-full border border-slate-700 px-2.5 py-1 text-[11px] font-black text-slate-200 transition hover:border-sky-300/70">Add</button>
                ) : null}
              </div>

              <div className="mt-2 space-y-2 lg:mt-3">
                {dayTemplates.length > 0 ? dayTemplates.map((template) => {
                  const id = templateId(template);
                  const hasCreatedSession = templateHasCreatedSession(template);
                  const checked = hasCreatedSession || templateChecked(template, selectedIds, hasControlledSelection);
                  return (
                    <article key={id || `${day.key}-${templateTime(template, 'start')}`} className={`rounded-xl border border-slate-800/90 bg-slate-950/65 p-2.5 transition lg:rounded-2xl lg:p-3 lg:ring-1 lg:ring-white/[0.03] ${checked ? 'opacity-100' : 'opacity-45'}`}>
                      <div className="flex items-start gap-3">
                        <input
                          type="checkbox"
                          checked={checked}
                          disabled={hasCreatedSession || !onToggleSeriesForWeek || !id}
                          onChange={(event) => onToggleSeriesForWeek?.(id, event.target.checked)}
                          className="mt-1 h-4 w-4 rounded border-slate-600 bg-slate-950 text-emerald-300 accent-emerald-300 disabled:cursor-not-allowed"
                          aria-label={`Use ${sessionTypeLabel(template)} at ${templateTime(template, 'start')}`}
                        />
                        <button type="button" onClick={() => onEditTemplate?.(template)} disabled={!onEditTemplate} className="min-w-0 flex-1 text-left disabled:cursor-default">
                          <div className="flex flex-wrap items-center gap-2">
                            <span className="rounded-full border border-slate-700 bg-slate-900/80 px-2 py-1 text-[10px] font-black uppercase tracking-[0.14em] text-slate-300">{sessionTypeLabel(template)}</span>
                            {hasCreatedSession ? <span className="rounded-full border border-emerald-400/30 bg-emerald-400/10 px-2 py-1 text-[10px] font-black text-emerald-100">Session created</span> : null}
                          </div>
                          <p className="mt-2 text-sm font-black text-white">{templateTime(template, 'start')} - {templateTime(template, 'end')}</p>
                          <p className="mt-1 truncate text-xs font-bold text-slate-300">{stringFrom(template, ['teamName', 'team'])}</p>
                          <p className="mt-1 truncate text-xs text-slate-500">{stringFrom(template, ['facilityName', 'facility'], 'No facility')}</p>
                          <p className="mt-2 text-xs font-bold text-slate-400">{participantsSummary(template)}</p>
                        </button>
                      </div>
                    </article>
                  );
                }) : (
                  <p className="px-1 py-2 text-xs font-bold text-slate-600 lg:rounded-2xl lg:border lg:border-dashed lg:border-slate-800 lg:px-3 lg:py-4">No templates</p>
                )}
              </div>
            </section>
          );
        })}
      </div>
    </section>
  );
}
