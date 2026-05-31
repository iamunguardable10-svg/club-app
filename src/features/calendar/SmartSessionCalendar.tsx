'use client';

import type { KeyboardEvent, MouseEvent, PointerEvent, ReactNode, RefObject } from 'react';

export type SmartCalendarMode = 'view' | 'edit';
export type SmartMobileCalendarView = 'week' | 'day';
export type SmartCalendarTone = 'primary' | 'secondary' | 'muted';
export type SmartCalendarDragKind = 'move' | 'resize';

export type SmartCalendarSession = {
  id: string;
  title: string;
  startsAt: string;
  endsAt: string | null;
  teamName: string;
  departmentName: string;
  tone: SmartCalendarTone;
  canManage: boolean;
};

export type SmartCalendarDraft = {
  startsAt: string;
  endsAt: string;
  teamLabel: string | null;
};

type SmartSessionCalendarProps = {
  mode: SmartCalendarMode;
  canCreateSessions: boolean;
  days: Date[];
  hours: number[];
  firstHour: number;
  lastHour: number;
  mobileVisibleHours: number[];
  mobileFirstHour: number;
  mobileHourHeight: number;
  mobileGridHeight: number;
  desktopHourHeight: number;
  activeDayIndex: number;
  mobileCalendarView: SmartMobileCalendarView;
  dayTransitionDirection: 'next' | 'previous' | null;
  sessions: SmartCalendarSession[];
  draft: SmartCalendarDraft | null;
  dragSessionId?: string | null;
  toolbarAccessory?: ReactNode;
  calendarScrollRef: RefObject<HTMLDivElement | null>;
  setDayRef: (index: number, element: HTMLDivElement | null) => void;
  onSetMode: (mode: SmartCalendarMode) => void;
  onClearDraft: () => void;
  onMobileDaySelect: (index: number) => void;
  onMobileCalendarViewChange: (view: SmartMobileCalendarView) => void;
  onMobileDaySwipeStart: (event: PointerEvent<HTMLDivElement>) => void;
  onMobileDaySwipeEnd: (event: PointerEvent<HTMLDivElement>) => void;
  onMobileDaySwipeCancel: () => void;
  onSlotPointerDown: (day: Date, event: PointerEvent<HTMLDivElement>) => void;
  onSessionPointerDown: (session: SmartCalendarSession, kind: SmartCalendarDragKind, event: PointerEvent<HTMLElement>) => void;
  onSessionClick: (session: SmartCalendarSession, event: MouseEvent<HTMLElement>) => void;
  onSessionKeyDown: (session: SmartCalendarSession, event: KeyboardEvent<HTMLElement>) => void;
  onDraftPointerDown: (kind: SmartCalendarDragKind, event: PointerEvent<HTMLElement>) => void;
  onDraftClick: () => void;
  onDraftCancel: () => void;
};

export function smartSameDay(a: Date, b: Date) {
  return a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();
}

export function smartAddMinutes(date: Date, minutes: number) {
  return new Date(date.getTime() + minutes * 60_000);
}

export function smartDurationMinutes(start: Date, end: Date) {
  return Math.max(30, Math.round((end.getTime() - start.getTime()) / 60_000));
}

export function smartFormatTimeRange(startsAt: string, endsAt: string | null) {
  const start = new Date(startsAt);
  const end = endsAt ? new Date(endsAt) : smartAddMinutes(start, 60);
  const formatter = new Intl.DateTimeFormat(undefined, { hour: '2-digit', minute: '2-digit' });
  return `${formatter.format(start)} - ${formatter.format(end)}`;
}

function minutesFromCalendarStart(value: string | Date, firstHour: number) {
  const date = typeof value === 'string' ? new Date(value) : value;
  return (date.getHours() - firstHour) * 60 + date.getMinutes();
}

function sessionDurationMinutes(session: SmartCalendarSession) {
  const start = new Date(session.startsAt);
  const end = session.endsAt ? new Date(session.endsAt) : smartAddMinutes(start, 60);
  return smartDurationMinutes(start, end);
}

function smartIsoDate(date: Date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
}

function toneClassFor(tone: SmartCalendarTone, density: 'compact' | 'regular') {
  if (tone === 'primary') return density === 'compact' ? 'border-sky-400 bg-sky-950/80 text-white' : 'border-sky-400 bg-sky-950/70 text-white shadow-[0_0_0_1px_rgba(56,189,248,0.35)]';
  if (tone === 'secondary') return density === 'compact' ? 'border-emerald-500/60 bg-emerald-950/60 text-slate-100' : 'border-emerald-500/60 bg-emerald-950/35 text-slate-100';
  return density === 'compact' ? 'border-slate-700 bg-slate-900/80 text-slate-300' : 'border-slate-800 bg-slate-900/50 text-slate-400';
}

export function SmartSessionCalendar({
  mode,
  canCreateSessions,
  days,
  hours,
  firstHour,
  lastHour,
  mobileVisibleHours,
  mobileFirstHour,
  mobileHourHeight,
  mobileGridHeight,
  desktopHourHeight,
  activeDayIndex,
  mobileCalendarView,
  dayTransitionDirection,
  sessions,
  draft,
  dragSessionId,
  toolbarAccessory,
  calendarScrollRef,
  setDayRef,
  onSetMode,
  onClearDraft,
  onMobileDaySelect,
  onMobileCalendarViewChange,
  onMobileDaySwipeStart,
  onMobileDaySwipeEnd,
  onMobileDaySwipeCancel,
  onSlotPointerDown,
  onSessionPointerDown,
  onSessionClick,
  onSessionKeyDown,
  onDraftPointerDown,
  onDraftClick,
  onDraftCancel,
}: SmartSessionCalendarProps) {
  const dragPreviewSession = dragSessionId ? sessions.find((session) => session.id === dragSessionId) ?? null : null;
  const dragPreviewDate = dragPreviewSession ? smartIsoDate(new Date(dragPreviewSession.startsAt)) : null;
  const dragPreviewDuration = dragPreviewSession ? sessionDurationMinutes(dragPreviewSession) : null;

  return (
    <>
      <div className="mb-2 flex flex-wrap items-center justify-end gap-2">
        {toolbarAccessory}
        <button
          type="button"
          onClick={() => {
            if (mode === 'edit') {
              onSetMode('view');
              onClearDraft();
              return;
            }
            onSetMode('edit');
          }}
          disabled={!canCreateSessions}
          className={`rounded-full border px-3 py-1.5 text-xs font-black ${mode === 'edit' ? 'border-sky-300 bg-sky-300 text-slate-950' : 'border-emerald-300 bg-emerald-300 text-slate-950'} disabled:cursor-not-allowed disabled:opacity-50`}
        >
          {mode === 'edit' ? 'Done' : 'Edit'}
        </button>
      </div>

      {dragPreviewSession ? (
        <div className="mb-3 rounded-2xl border border-sky-300/40 bg-sky-300/10 px-3 py-2 text-xs font-black text-sky-100 shadow-[0_16px_50px_rgba(56,189,248,0.14)]">
          {new Date(dragPreviewSession.startsAt).toLocaleDateString(undefined, { weekday: 'short' })} · {smartFormatTimeRange(dragPreviewSession.startsAt, dragPreviewSession.endsAt)}
          {dragPreviewDuration ? ` · ${dragPreviewDuration} min` : ''}
        </div>
      ) : null}

      <section className={`${mobileCalendarView === 'week' ? 'block' : 'hidden'} overflow-hidden rounded-3xl border border-slate-800 bg-slate-950/80 md:hidden`}>
        <div className="grid grid-cols-[34px_repeat(7,minmax(0,1fr))] border-b border-slate-800 text-[9px] font-black uppercase tracking-[0.08em] text-slate-500">
          <div className="bg-slate-950/95 p-1.5">Time</div>
          {days.map((day, index) => (
            <button key={day.toISOString()} type="button" onClick={() => { onMobileDaySelect(index); onMobileCalendarViewChange('day'); }} className={`border-l border-slate-800 p-1.5 ${activeDayIndex === index ? 'bg-sky-300 text-slate-950' : ''}`}>
              <span className="block">{day.toLocaleDateString(undefined, { weekday: 'short' }).slice(0, 2)}</span>
              <span className="block">{day.toLocaleDateString(undefined, { day: '2-digit' })}</span>
            </button>
          ))}
        </div>
        <div ref={calendarScrollRef} className="overflow-hidden touch-pan-y">
          <div className="grid grid-cols-[34px_repeat(7,minmax(0,1fr))]">
            <div className="bg-slate-950/95">
              {mobileVisibleHours.map((hour) => <div key={hour} className="border-b border-slate-900 px-1 py-1 text-[9px] font-bold text-slate-500" style={{ height: mobileHourHeight }}>{String(hour).padStart(2, '0')}</div>)}
            </div>
            {days.map((day, dayIndex) => {
              const daySessions = sessions.filter((session) => smartSameDay(new Date(session.startsAt), day));
              const draftIsOnDay = draft ? smartSameDay(new Date(draft.startsAt), day) : false;
              const isDragPreviewDay = dragPreviewDate === smartIsoDate(day);
              return (
                <div key={day.toISOString()} data-smart-day={smartIsoDate(day)} data-density="mobile" ref={(element) => setDayRef(dayIndex, element)} onPointerDown={(event) => onSlotPointerDown(day, event)} className={`relative border-l border-slate-900 transition-colors ${isDragPreviewDay ? 'bg-sky-300/[0.07] ring-1 ring-inset ring-sky-300/35' : ''}`} style={{ height: mobileGridHeight, touchAction: 'pan-y' }}>
                  {mobileVisibleHours.map((hour) => <div key={hour} className="border-b border-slate-900" style={{ height: mobileHourHeight }} />)}
                  {daySessions.map((session) => {
                    const start = new Date(session.startsAt);
                    const top = Math.max(0, ((start.getHours() - mobileFirstHour) * 60 + start.getMinutes()) * (mobileHourHeight / 60));
                    const height = Math.min(Math.max(20, sessionDurationMinutes(session) * (mobileHourHeight / 60)), mobileGridHeight - top);
                    return (
                      <div key={session.id} role="button" tabIndex={0} data-calendar-session="true" onPointerDown={(event) => onSessionPointerDown(session, 'move', event)} onClick={(event) => onSessionClick(session, event)} onKeyDown={(event) => onSessionKeyDown(session, event)} style={{ top, height, touchAction: mode === 'edit' && session.canManage ? 'none' : 'pan-y' }} className={`absolute left-0.5 right-0.5 overflow-hidden rounded-md border px-1 py-0.5 text-left transition-[top,height,filter,box-shadow,transform] duration-100 ease-out ${toneClassFor(session.tone, 'compact')} ${dragSessionId === session.id ? 'z-20 scale-[1.035] ring-1 ring-sky-200 brightness-125 shadow-[0_18px_40px_rgba(56,189,248,0.3)]' : ''}`}>
                        <p className="truncate text-[9px] font-black leading-tight">{session.teamName}</p>
                        {dragSessionId === session.id && dragPreviewDuration ? <span className="absolute right-1 top-1 rounded bg-slate-950/85 px-1 text-[7px] font-black text-sky-100 ring-1 ring-sky-200/40">{dragPreviewDuration}m</span> : null}
                        {height > 30 ? <p className="truncate text-[8px] leading-tight opacity-80">{session.departmentName}</p> : null}
                        {mode === 'edit' && session.canManage ? <span aria-hidden="true" onPointerDown={(event) => onSessionPointerDown(session, 'resize', event)} className="absolute inset-x-1 bottom-0 h-2 cursor-ns-resize rounded-t bg-white/40" /> : null}
                      </div>
                    );
                  })}
                  {draftIsOnDay && draft ? (() => {
                    const start = new Date(draft.startsAt);
                    const top = Math.max(0, ((start.getHours() - mobileFirstHour) * 60 + start.getMinutes()) * (mobileHourHeight / 60));
                    const height = Math.min(Math.max(20, smartDurationMinutes(new Date(draft.startsAt), new Date(draft.endsAt)) * (mobileHourHeight / 60)), mobileGridHeight - top);
                    return <article data-calendar-session="true" onPointerDown={(event) => onDraftPointerDown('move', event)} onClick={onDraftClick} style={{ top, height, touchAction: 'none' }} className="absolute left-0.5 right-0.5 z-20 cursor-grab overflow-hidden rounded-md border border-sky-300 bg-sky-500/40 px-1 py-0.5 text-[9px] font-black text-sky-50"><span>Training</span><button type="button" onPointerDown={(event) => onDraftPointerDown('resize', event)} className="absolute inset-x-1 bottom-0 h-2 rounded-t bg-sky-100/90" aria-label="Resize session draft" /></article>;
                  })() : null}
                </div>
              );
            })}
          </div>
        </div>
      </section>

      <section className={`${mobileCalendarView === 'day' ? 'block' : 'hidden'} overflow-hidden rounded-3xl border border-slate-800 bg-slate-950/80 md:hidden`}>
        <div className="flex items-center justify-between border-b border-slate-800 p-2">
          <button type="button" onClick={() => onMobileCalendarViewChange('week')} className="rounded-lg border border-slate-700 px-2.5 py-1.5 text-xs font-black text-slate-200">Week view</button>
          <div className="flex items-center gap-2">
            <button type="button" onClick={() => onMobileDaySelect(activeDayIndex - 1)} className="rounded-lg border border-slate-700 px-2 py-1 text-xs font-black text-slate-200">‹</button>
            <span className="text-xs font-black text-slate-200">{days[activeDayIndex].toLocaleDateString(undefined, { weekday: 'short', day: '2-digit' })}</span>
            <button type="button" onClick={() => onMobileDaySelect(activeDayIndex + 1)} className="rounded-lg border border-slate-700 px-2 py-1 text-xs font-black text-slate-200">›</button>
          </div>
        </div>
        <div ref={calendarScrollRef} onPointerDown={onMobileDaySwipeStart} onPointerUp={onMobileDaySwipeEnd} onPointerCancel={onMobileDaySwipeCancel} className={`overflow-hidden rounded-b-3xl touch-pan-y transition-all duration-200 ${dayTransitionDirection === 'next' ? 'translate-x-1 scale-[0.99] ring-2 ring-sky-300/40' : dayTransitionDirection === 'previous' ? '-translate-x-1 scale-[0.99] ring-2 ring-sky-300/40' : ''}`}>
          <div className="grid grid-cols-[52px_minmax(0,1fr)]">
            <div className="bg-slate-950/95">
              {mobileVisibleHours.map((hour) => <div key={hour} className="border-b border-slate-900 px-2 py-1 text-[10px] font-bold text-slate-500" style={{ height: mobileHourHeight }}>{String(hour).padStart(2, '0')}:00</div>)}
            </div>
            {(() => {
              const day = days[activeDayIndex];
              const daySessions = sessions.filter((session) => smartSameDay(new Date(session.startsAt), day));
              const draftIsOnDay = draft ? smartSameDay(new Date(draft.startsAt), day) : false;
              const isDragPreviewDay = dragPreviewDate === smartIsoDate(day);
              return (
                <div data-smart-day={smartIsoDate(day)} data-density="mobile" ref={(element) => setDayRef(activeDayIndex, element)} onPointerDown={(event) => onSlotPointerDown(day, event)} className={`relative border-l border-slate-900 transition-colors ${isDragPreviewDay ? 'bg-sky-300/[0.07] ring-1 ring-inset ring-sky-300/35' : ''}`} style={{ height: mobileGridHeight, touchAction: 'pan-y' }}>
                  {mobileVisibleHours.map((hour) => <div key={hour} className="border-b border-slate-900" style={{ height: mobileHourHeight }} />)}
                  {daySessions.map((session) => {
                    const start = new Date(session.startsAt);
                    const top = Math.max(0, ((start.getHours() - mobileFirstHour) * 60 + start.getMinutes()) * (mobileHourHeight / 60));
                    const height = Math.min(Math.max(24, sessionDurationMinutes(session) * (mobileHourHeight / 60)), mobileGridHeight - top);
                    return (
                      <div key={session.id} role="button" tabIndex={0} data-calendar-session="true" onPointerDown={(event) => onSessionPointerDown(session, 'move', event)} onClick={(event) => onSessionClick(session, event)} onKeyDown={(event) => onSessionKeyDown(session, event)} style={{ top, height, touchAction: mode === 'edit' && session.canManage ? 'none' : 'pan-y' }} className={`absolute left-2 right-2 overflow-hidden rounded-xl border px-2 py-1 text-left transition-[top,height,filter,box-shadow,transform] duration-100 ease-out ${toneClassFor(session.tone, 'compact')} ${dragSessionId === session.id ? 'z-20 scale-[1.025] ring-2 ring-sky-200 brightness-125 shadow-[0_18px_45px_rgba(56,189,248,0.32)]' : ''}`}>
                        <p className="truncate text-xs font-black">{session.teamName}</p>
                        {dragSessionId === session.id && dragPreviewDuration ? <span className="absolute right-2 top-1 rounded-md bg-slate-950/85 px-1 text-[9px] font-black text-sky-100 ring-1 ring-sky-200/40">{dragPreviewDuration}m</span> : null}
                        <p className="truncate text-[10px] opacity-80">{session.departmentName} · {smartFormatTimeRange(session.startsAt, session.endsAt)}</p>
                        {mode === 'edit' && session.canManage ? <span aria-hidden="true" onPointerDown={(event) => onSessionPointerDown(session, 'resize', event)} className="absolute inset-x-4 bottom-0 h-3 cursor-ns-resize rounded-t bg-white/40" /> : null}
                      </div>
                    );
                  })}
                  {draftIsOnDay && draft ? (() => {
                    const start = new Date(draft.startsAt);
                    const top = Math.max(0, ((start.getHours() - mobileFirstHour) * 60 + start.getMinutes()) * (mobileHourHeight / 60));
                    const height = Math.min(Math.max(24, smartDurationMinutes(new Date(draft.startsAt), new Date(draft.endsAt)) * (mobileHourHeight / 60)), mobileGridHeight - top);
                    return <article data-calendar-session="true" onPointerDown={(event) => onDraftPointerDown('move', event)} onClick={onDraftClick} style={{ top, height, touchAction: 'none' }} className="absolute left-2 right-2 z-20 cursor-grab overflow-hidden rounded-xl border border-sky-300 bg-sky-500/40 px-2 py-1 text-xs font-black text-sky-50"><span>Training</span><button type="button" onPointerDown={(event) => onDraftPointerDown('resize', event)} className="absolute inset-x-4 bottom-0 h-3 rounded-t bg-sky-100/90" aria-label="Resize session draft" /></article>;
                  })() : null}
                </div>
              );
            })()}
          </div>
        </div>
      </section>

      <section className="hidden overflow-hidden rounded-3xl border border-slate-800 bg-slate-950/80 md:block">
        <div className="overflow-hidden">
          <div className="min-w-0">
            <div className="grid grid-cols-[72px_minmax(170px,1fr)] border-b border-slate-800 text-xs font-black uppercase tracking-[0.16em] text-slate-500 md:grid-cols-[72px_repeat(7,minmax(0,1fr))]">
              <div className="sticky left-0 z-20 bg-slate-950/95 p-3">Time</div>
              {days.map((day, index) => <div key={day.toISOString()} className={`border-l border-slate-800 p-3 ${index === activeDayIndex ? 'block' : 'hidden'} md:block`}>{day.toLocaleDateString(undefined, { weekday: 'short', day: '2-digit' })}</div>)}
            </div>
            <div className="grid grid-cols-[72px_minmax(170px,1fr)] md:grid-cols-[72px_repeat(7,minmax(0,1fr))]">
              <div className="sticky left-0 z-10 bg-slate-950/95">
                {hours.map((hour) => <div key={hour} className="border-b border-slate-900 p-3 text-xs font-bold text-slate-500" style={{ height: desktopHourHeight }}>{String(hour).padStart(2, '0')}:00</div>)}
              </div>
              {days.map((day, dayIndex) => {
                const daySessions = sessions.filter((session) => smartSameDay(new Date(session.startsAt), day));
                const draftIsOnDay = draft ? smartSameDay(new Date(draft.startsAt), day) : false;
                const isDragPreviewDay = dragPreviewDate === smartIsoDate(day);
                return (
                  <div key={day.toISOString()} data-smart-day={smartIsoDate(day)} data-density="desktop" ref={(element) => setDayRef(dayIndex, element)} onPointerDown={(event) => onSlotPointerDown(day, event)} className={`relative border-l border-slate-900 transition-colors ${mode === 'edit' ? 'cursor-crosshair' : 'cursor-default'} ${dayIndex === activeDayIndex ? 'block' : 'hidden'} ${isDragPreviewDay ? 'bg-sky-300/[0.05] ring-1 ring-inset ring-sky-300/30' : ''} md:block`} style={{ height: `${hours.length * desktopHourHeight}px`, touchAction: 'pan-y' }}>
                    {hours.map((hour) => <div key={hour} className="border-b border-slate-900" style={{ height: desktopHourHeight }} />)}
                    {daySessions.map((session) => {
                      const top = Math.max(0, minutesFromCalendarStart(session.startsAt, firstHour) * (desktopHourHeight / 60));
                      const height = Math.min(Math.max(44, sessionDurationMinutes(session) * (desktopHourHeight / 60)), (lastHour - firstHour) * desktopHourHeight - top);
                      return (
                        <div key={session.id} role="button" tabIndex={0} data-calendar-session="true" onPointerDown={(event) => onSessionPointerDown(session, 'move', event)} onClick={(event) => onSessionClick(session, event)} onKeyDown={(event) => onSessionKeyDown(session, event)} style={{ top, height, touchAction: mode === 'edit' && session.canManage ? 'none' : 'pan-y' }} className={`absolute left-2 right-2 overflow-hidden rounded-2xl border p-3 text-left transition-[top,height,filter,box-shadow,transform] duration-100 ease-out ${toneClassFor(session.tone, 'regular')} ${dragSessionId === session.id ? 'z-20 scale-[1.025] ring-2 ring-sky-200 brightness-125 shadow-[0_22px_60px_rgba(56,189,248,0.34)]' : ''} ${mode === 'edit' && session.canManage ? 'cursor-grab active:cursor-grabbing' : ''}`}>
                          <p className="text-xs font-black uppercase tracking-[0.12em]">{session.teamName}</p>
                          {dragSessionId === session.id && dragPreviewDuration ? <span className="absolute right-2 top-2 rounded-md bg-slate-950/85 px-1.5 py-0.5 text-[10px] font-black text-sky-100 ring-1 ring-sky-200/40">{dragPreviewDuration}m</span> : null}
                          <p className="mt-1 text-sm font-black">{session.title}</p>
                          <p className="mt-1 text-xs">{session.departmentName} | {smartFormatTimeRange(session.startsAt, session.endsAt)}</p>
                          {mode === 'edit' && session.canManage ? <span aria-hidden="true" onPointerDown={(event) => onSessionPointerDown(session, 'resize', event)} className="absolute inset-x-5 bottom-0 h-5 cursor-ns-resize rounded-t-full bg-white/40" /> : null}
                        </div>
                      );
                    })}
                    {draftIsOnDay && draft ? (() => {
                      const top = Math.max(0, minutesFromCalendarStart(draft.startsAt, firstHour) * (desktopHourHeight / 60));
                      const height = Math.min(Math.max(44, smartDurationMinutes(new Date(draft.startsAt), new Date(draft.endsAt)) * (desktopHourHeight / 60)), (lastHour - firstHour) * desktopHourHeight - top);
                      return (
                        <article data-calendar-session="true" onPointerDown={(event) => onDraftPointerDown('move', event)} onClick={onDraftClick} style={{ top, height, touchAction: 'none' }} className="absolute left-2 right-2 z-20 cursor-grab overflow-hidden rounded-2xl border border-sky-300 bg-sky-500/20 p-2.5 pr-16 text-left text-sky-50 shadow-[0_0_0_1px_rgba(125,211,252,0.4)] active:cursor-grabbing">
                          <div className="absolute right-2 top-2 flex gap-1">
                            <button type="button" onPointerDown={(event) => event.stopPropagation()} onClick={(event) => { event.stopPropagation(); onDraftCancel(); }} className="grid h-7 w-7 place-items-center rounded-full border border-slate-600 bg-slate-950/85 text-xs font-black text-slate-200 hover:border-red-300 hover:text-red-200" aria-label="Cancel session draft">{'x'}</button>
                            <button type="button" onPointerDown={(event) => event.stopPropagation()} onClick={(event) => { event.stopPropagation(); onDraftClick(); }} className="grid h-7 w-7 place-items-center rounded-full bg-sky-300 text-xs font-black text-slate-950 hover:bg-sky-200" aria-label="Confirm session draft">{'\u2713'}</button>
                          </div>
                          <p className="text-sm font-black">Training</p>
                          <p className="mt-1 text-xs">{smartFormatTimeRange(draft.startsAt, draft.endsAt)}</p>
                          <p className="mt-1 truncate text-xs text-sky-100/80">{draft.teamLabel ?? 'Tap to choose team'}</p>
                          <button type="button" onPointerDown={(event) => onDraftPointerDown('resize', event)} className="absolute bottom-0 left-1/2 h-5 w-20 -translate-x-1/2 rounded-t-full bg-sky-200/90" aria-label="Resize session draft" />
                        </article>
                      );
                    })() : null}
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      </section>
    </>
  );
}
