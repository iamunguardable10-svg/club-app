'use client';

import { useEffect, useMemo, useState } from 'react';
import { Bar, CartesianGrid, ComposedChart, Line, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { ACWR_ZONES, LOAD_TRAINING_TYPES, LOAD_TYPE_COLORS, type ACWRDataPoint, type AthleteLoadEntry, type AthletePendingSession, type LoadTrainingType } from './loadTypes';
import { BASELINE_DAYS, aggregateDailyLoads, calculateACWR, fillMissingDays, projectFutureACWR, todayISO } from './loadCalculations';
import { formatDayMonth, formatDecimal, formatEntryDate } from '@/shared/format';
import { useT } from '@/shared/i18n';
import { loadTypeLabel } from './loadLabels';
import { FORECAST_BASIS_KEY, WEEKLY_LOAD_METRICS, buildWeeklyLoadDayProfile, buildWeeklyLoadProfile, weeklyLoadDomain, type WeeklyLoadMetric, type WeeklyLoadProfilePoint } from './AthleteLoadWorkspace';

// Charts of the load view, split from AthleteLoadWorkspace so recharts loads only where a chart is shown.

type LoadChartRange = 7 | 14 | 30 | 60;

type LoadChartDatum = {
  date: string;
  label: string;
  totalLoad: number;
  forecastLoad: number;
  acuteLoad: number | null;
  chronicLoad: number | null;
  acwr: number | null;
  projectedAcwr: number | null;
  entryCount: number;
  isProjected: boolean;
  forecastBasis?: string;
  chronicFull?: boolean;
} & Partial<Record<LoadTrainingType, number>> & Record<string, string | number | boolean | null | undefined>;

type LoadTooltipProps = {
  active?: boolean;
  payload?: ReadonlyArray<{ payload?: LoadChartDatum; dataKey?: string; value?: number | string | null; color?: string; name?: string }>;
};

function LoadTooltip({ active, payload }: LoadTooltipProps) {
  const t = useT();
  if (!active || !payload?.length) return null;
  const point = payload[0]?.payload;
  if (!point) return null;
  const segments = LOAD_TRAINING_TYPES.filter((type) => (point[type] ?? 0) > 0);
  const forecastSegments = LOAD_TRAINING_TYPES.filter((type) => (Number(point[`${type}_p`]) || 0) > 0);

  return (
    <div className="min-w-56 rounded-2xl border border-slate-700 bg-slate-950/95 p-3 shadow-[0_24px_80px_rgba(0,0,0,0.45)] ring-1 ring-white/[0.04] backdrop-blur-xl">
      <div className="flex items-start justify-between gap-4">
        <div>
          <p className="text-xs font-black text-white">{formatEntryDate(point.date)}</p>
          <p className="mt-1 text-[11px] font-bold text-slate-500">{point.isProjected ? (point.forecastBasis && FORECAST_BASIS_KEY[point.forecastBasis] ? t(FORECAST_BASIS_KEY[point.forecastBasis]) : point.forecastBasis) : t('load.chart.entries', { count: point.entryCount })}</p>
        </div>
        <div className="text-right">
          <p className="text-lg font-black text-emerald-200">{point.isProjected ? point.forecastLoad : point.totalLoad}</p>
          <p className="text-[10px] font-black uppercase tracking-[0.16em] text-slate-500">AU</p>
        </div>
      </div>
      <div className="mt-3 grid grid-cols-3 gap-2">
        <div className="rounded-xl border border-slate-800 bg-slate-900/70 p-2">
          <p className="text-[9px] font-black uppercase tracking-[0.14em] text-slate-500">ACWR</p>
          <p className="mt-1 text-sm font-black text-white">{(point.acwr ?? point.projectedAcwr) ? formatDecimal((point.acwr ?? point.projectedAcwr)!) : '—'}</p>
        </div>
        <div className="rounded-xl border border-slate-800 bg-slate-900/70 p-2">
          <p className="text-[9px] font-black uppercase tracking-[0.14em] text-slate-500">{t('load.chart.acute')}</p>
          <p className="mt-1 text-sm font-black text-white">{point.acuteLoad !== null && !point.isProjected ? Math.round(point.acuteLoad) : '—'}</p>
        </div>
        <div className="rounded-xl border border-slate-800 bg-slate-900/70 p-2">
          <p className="text-[9px] font-black uppercase tracking-[0.14em] text-slate-500">{t('load.chart.chronic')}</p>
          <p className="mt-1 text-sm font-black text-white">{point.chronicLoad !== null && !point.isProjected ? Math.round(point.chronicLoad) : '—'}</p>
        </div>
      </div>
      {!point.chronicFull ? (
        <div className="mt-3 rounded-xl border border-amber-300/25 bg-amber-300/10 px-3 py-2 text-[11px] font-bold text-amber-100">
          {t('load.chart.baselineBuilding', { count: BASELINE_DAYS })}
        </div>
      ) : null}
      {segments.length > 0 ? (
        <div className="mt-3 space-y-1.5">
          {segments.map((type) => (
            <div key={type} className="flex items-center justify-between gap-3 text-[11px] font-bold text-slate-300">
              <span className="inline-flex items-center gap-2">
                <span className="h-2 w-2 rounded-full" style={{ backgroundColor: LOAD_TYPE_COLORS[type] }} />
                {loadTypeLabel(type)}
              </span>
              <span>{t('load.room.au', { value: Number(point[type]) })}</span>
            </div>
          ))}
        </div>
      ) : null}
      {forecastSegments.length > 0 ? (
        <div className="mt-3 space-y-1.5 border-t border-slate-800 pt-3">
          {forecastSegments.map((type) => (
            <div key={`${type}_p`} className="flex items-center justify-between gap-3 text-[11px] font-bold text-slate-300">
              <span className="inline-flex items-center gap-2">
                <span className="h-2 w-2 rounded-full opacity-60" style={{ backgroundColor: LOAD_TYPE_COLORS[type] }} />
                {t('load.chart.typeForecast', { type: loadTypeLabel(type) })}
              </span>
              <span>{t('load.room.au', { value: Number(point[`${type}_p`]) })}</span>
            </div>
          ))}
        </div>
      ) : null}
    </div>
  );
}

function projectionSegments(point?: ACWRDataPoint) {
  if (!point) return {};
  const entries = LOAD_TRAINING_TYPES.map((type) => {
    const planned = point.plannedLoads?.[type] ?? 0;
    return [`${type}_p`, planned > 0 ? planned : 0];
  });
  return Object.fromEntries(entries);
}

function plannedProjectionLoad(point?: ACWRDataPoint) {
  if (!point?.plannedLoads) return 0;
  return LOAD_TRAINING_TYPES.reduce((sum, type) => sum + (point.plannedLoads?.[type] ?? 0), 0);
}

export function LoadChart({ entries, pendingSessions }: { entries: AthleteLoadEntry[]; pendingSessions: AthletePendingSession[] }) {
  const t = useT();
  const [isMobile, setIsMobile] = useState(false);
  const [isCompactViewport, setIsCompactViewport] = useState(false);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [isLandscape, setIsLandscape] = useState(false);
  const [range, setRange] = useState<LoadChartRange>(14);
  const [showLoadLines, setShowLoadLines] = useState(false);

  useEffect(() => {
    const syncViewport = () => {
      const mobile = window.innerWidth < 640;
      setIsMobile(mobile);
      setIsCompactViewport(window.innerWidth < 1024);
      setIsLandscape(window.innerWidth > window.innerHeight);
      if (mobile && !isFullscreen) {
        setRange((current) => (current === 60 ? 30 : current));
      }
    };
    syncViewport();
    window.addEventListener('resize', syncViewport);
    return () => window.removeEventListener('resize', syncViewport);
  }, [isFullscreen]);

  useEffect(() => {
    if (!isFullscreen) return;
    const previous = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => { document.body.style.overflow = previous; };
  }, [isFullscreen]);

  const daily = fillMissingDays(aggregateDailyLoads(entries), Math.max(range, 84));
  const acwr = calculateACWR(entries);
  const projected = projectFutureACWR(entries, pendingSessions, 14);
  const acwrByDate = new Map(acwr.map((point) => [point.date, point]));
  const projectedByDate = new Map(projected.map((point) => [point.date, point]));
  const entriesByDate = new Map<string, AthleteLoadEntry[]>();
  for (const entry of entries) {
    entriesByDate.set(entry.date, [...(entriesByDate.get(entry.date) ?? []), entry]);
  }
  const historicalData: LoadChartDatum[] = daily.slice(-range).map((day) => {
    const point = acwrByDate.get(day.date);
    const projection = projectedByDate.get(day.date);
    return {
      date: day.date,
      label: formatDayMonth(day.date),
      totalLoad: day.totalLoad,
      forecastLoad: plannedProjectionLoad(projection),
      acuteLoad: point?.acuteLoad ?? 0,
      chronicLoad: point?.chronicLoad ?? 0,
      acwr: point?.acwr ?? null,
      projectedAcwr: projection?.acwr ?? null,
      entryCount: entriesByDate.get(day.date)?.length ?? 0,
      isProjected: false,
      forecastBasis: projection?.forecastBasis,
      chronicFull: point?.chronicFull ?? false,
      ...day.loads,
      ...projectionSegments(projection),
    };
  });
  const lastHistoricalDate = daily[daily.length - 1]?.date ?? todayISO();
  const projectedLimit = isMobile ? (range === 7 ? 2 : 3) : range === 7 ? 7 : 14;
  const projectedData: LoadChartDatum[] = projected.filter((point) => point.date > lastHistoricalDate).slice(0, projectedLimit).map((point) => ({
    date: point.date,
    label: formatDayMonth(point.date),
    totalLoad: 0,
    forecastLoad: plannedProjectionLoad(point),
    acuteLoad: null,
    chronicLoad: null,
    acwr: null,
    projectedAcwr: point.acwr,
    entryCount: 0,
    isProjected: true,
    forecastBasis: point.forecastBasis,
    chronicFull: point.chronicFull,
    ...projectionSegments(point),
  })) as LoadChartDatum[];
  const chartData = [...historicalData, ...projectedData];

  const maxLoad = Math.max(600, ...chartData.map((day) => Math.max(day.totalLoad, day.forecastLoad)));
  const ranges = isMobile ? ([7, 14, 30] as const) : ([7, 14, 30, 60] as const);
  const fullscreenRanges = [14, 30, 60] as const;
  const chartMinWidth = '100%';
  const chartHeight = isMobile ? (range === 7 ? 300 : 320) : isCompactViewport ? 340 : 360;
  const chartMargin = (fullscreen = false) => ({
    top: fullscreen ? 16 : 14,
    right: fullscreen ? 18 : 8,
    bottom: fullscreen ? 22 : 24,
    left: fullscreen ? 14 : isMobile ? 0 : 22,
  });
  const openFullscreen = () => {
    setRange((current) => (current === 7 ? 14 : current));
    setIsFullscreen(true);
  };
  const closeFullscreen = () => {
    setIsFullscreen(false);
    if (isMobile) {
      setRange((current) => (current === 60 ? 30 : current));
    }
  };

  const chart = (fullscreen = false) => (
    <ResponsiveContainer width="100%" height="100%">
      <ComposedChart data={chartData} margin={chartMargin(fullscreen)} barCategoryGap={range === 7 ? '18%' : range === 14 ? '10%' : range === 30 ? '8%' : '3%'}>
        <CartesianGrid stroke="rgba(148,163,184,0.10)" vertical={false} />
        <XAxis
          dataKey="label"
          tick={{ fill: '#64748b', fontSize: fullscreen ? 11 : isMobile ? 9 : 11, fontWeight: 800 }}
          tickLine={false}
          axisLine={false}
          interval={range === 7 ? 0 : isMobile ? 1 : range === 14 ? 1 : range === 30 ? 4 : 9}
          angle={-28}
          textAnchor="end"
          height={36}
        />
        <YAxis
          yAxisId="load"
          domain={[0, Math.ceil(maxLoad / 100) * 100]}
          tick={{ fill: '#64748b', fontSize: fullscreen ? 11 : isMobile ? 9 : 11, fontWeight: 800 }}
          tickLine={false}
          axisLine={false}
          width={fullscreen ? 58 : isMobile ? 38 : 72}
        />
        <YAxis
          yAxisId="acwr"
          orientation="right"
          domain={[0, 2.5]}
          ticks={[0.8, 1, 1.3, 2]}
          tick={{ fill: '#64748b', fontSize: fullscreen ? 11 : isMobile ? 9 : 11, fontWeight: 800 }}
          tickLine={false}
          axisLine={false}
          width={fullscreen ? 38 : isMobile ? 26 : 34}
        />
        <Tooltip cursor={{ fill: 'rgba(125,211,252,0.07)' }} content={(props) => <LoadTooltip {...(props as unknown as LoadTooltipProps)} />} />
        <ReferenceLine yAxisId="acwr" y={ACWR_ZONES.low} stroke="#38bdf8" strokeDasharray="5 6" strokeOpacity={0.62} />
        <ReferenceLine yAxisId="acwr" y={ACWR_ZONES.high} stroke="#fb7185" strokeDasharray="5 6" strokeOpacity={0.62} />
        {LOAD_TRAINING_TYPES.map((type, index) => (
          <Bar
            key={type}
            yAxisId="load"
            dataKey={type}
            stackId="load"
            fill={LOAD_TYPE_COLORS[type]}
            maxBarSize={range === 7 ? 44 : range === 14 ? 34 : range === 30 ? 30 : 22}
            radius={index === LOAD_TRAINING_TYPES.length - 1 ? [8, 8, 2, 2] : [2, 2, 2, 2]}
            isAnimationActive={false}
            name={loadTypeLabel(type)}
          />
        ))}
        {LOAD_TRAINING_TYPES.map((type) => (
          <Bar
            key={`${type}_p`}
            yAxisId="load"
            dataKey={`${type}_p`}
            stackId="load"
            fill={LOAD_TYPE_COLORS[type]}
            fillOpacity={0.28}
            stroke={LOAD_TYPE_COLORS[type]}
            strokeOpacity={0.48}
            maxBarSize={range === 7 ? 44 : range === 14 ? 34 : range === 30 ? 30 : 22}
            radius={[8, 8, 2, 2]}
            isAnimationActive={false}
            name={t('load.chart.typeForecast', { type: loadTypeLabel(type) })}
          />
        ))}
        {showLoadLines ? (
          <>
            <Line
              yAxisId="load"
              type="monotone"
              dataKey="acuteLoad"
              stroke="#facc15"
              strokeDasharray="6 5"
              strokeWidth={2}
              dot={false}
              activeDot={{ r: 4, fill: '#fef3c7', stroke: '#facc15', strokeWidth: 2 }}
              name={t('load.chart.acuteLoad')}
            />
            <Line
              yAxisId="load"
              type="monotone"
              dataKey="chronicLoad"
              stroke="#34d399"
              strokeDasharray="6 5"
              strokeWidth={2}
              dot={false}
              activeDot={{ r: 4, fill: '#d1fae5', stroke: '#34d399', strokeWidth: 2 }}
              name={t('load.chart.chronicLoad')}
            />
          </>
        ) : null}
        <Line
          yAxisId="acwr"
          type="monotone"
          dataKey="acwr"
          stroke="#f472b6"
          strokeWidth={3}
          dot={{ r: range === 7 ? 4 : 2, fill: '#0f172a', stroke: '#f472b6', strokeWidth: 2 }}
          activeDot={{ r: 6, fill: '#fdf2f8', stroke: '#f472b6', strokeWidth: 3 }}
          connectNulls={false}
          name="ACWR"
        />
        <Line
          yAxisId="acwr"
          type="monotone"
          dataKey="projectedAcwr"
          stroke="#a78bfa"
          strokeWidth={2}
          strokeDasharray="5 5"
          dot={{ r: 3, fill: '#0f172a', stroke: '#a78bfa', strokeWidth: 2 }}
          activeDot={{ r: 5, fill: '#faf5ff', stroke: '#a78bfa', strokeWidth: 3 }}
          connectNulls={false}
          name={t('load.chart.forecastAcwr')}
        />
      </ComposedChart>
    </ResponsiveContainer>
  );

  if (entries.length === 0) {
    return (
      <div className="flex min-h-64 items-center justify-center rounded-3xl border border-dashed border-slate-800 bg-slate-950/50 text-sm font-bold text-slate-500">
        {t('load.chart.noLoad')}
      </div>
    );
  }

  return (
    <div className="w-full min-w-0 overflow-hidden rounded-[1.5rem] border border-slate-800/80 bg-slate-950/55 sm:rounded-3xl p-3">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2 px-1">
        <div className="flex flex-wrap gap-2">
          <div className="flex rounded-full border border-slate-800 bg-slate-950/80 p-1">
            {ranges.map((item) => (
              <button
                key={item}
                type="button"
                onClick={() => setRange(item)}
                className={`rounded-full px-3 py-1.5 text-xs font-black transition ${range === item ? 'bg-emerald-300 text-slate-950' : 'text-slate-400 hover:text-slate-100'}`}
              >
                {t('load.chart.days', { count: item })}
              </button>
            ))}
          </div>
          <button
            type="button"
            onClick={() => setShowLoadLines((current) => !current)}
            className={`rounded-full border px-2.5 py-1 text-[10px] font-black transition ${showLoadLines ? 'border-amber-300 bg-amber-300 text-slate-950' : 'border-slate-800 bg-slate-950/80 text-slate-400 hover:text-slate-100'}`}
          >
            A/C
          </button>
        </div>
        <div className="flex items-center gap-2 text-[11px] font-bold text-slate-500">
          <span className="hidden items-center gap-1.5 sm:inline-flex"><span className="h-px w-5 bg-sky-300" /> {t('load.chart.low', { value: formatDecimal(ACWR_ZONES.low, 1) })}</span>
          <span className="hidden items-center gap-1.5 sm:inline-flex"><span className="h-px w-5 bg-rose-300" /> {t('load.chart.high', { value: formatDecimal(ACWR_ZONES.high, 1) })}</span>
          <button type="button" onClick={openFullscreen} aria-label={t('load.chart.openFullscreen')} className="inline-grid h-8 w-8 place-items-center bg-transparent text-lg font-black text-slate-300 transition hover:text-white sm:hidden">
            ⛶
          </button>
        </div>
      </div>
      <div className="w-full max-w-full overflow-hidden pb-1">
        <div style={{ minWidth: chartMinWidth, height: chartHeight }}>
          {chart(false)}
        </div>
      </div>
      <div className="mt-2 flex flex-wrap gap-2 px-1 pb-1">
        {LOAD_TRAINING_TYPES.slice(0, 5).map((type) => (
          <span key={type} className="inline-flex items-center gap-1.5 text-[11px] font-bold text-slate-400">
            <span className="h-2 w-2 rounded-full" style={{ backgroundColor: LOAD_TYPE_COLORS[type] }} />
            {loadTypeLabel(type)}
          </span>
        ))}
        <span className="ml-auto text-[11px] font-bold text-slate-500">{t('load.chart.legend')}</span>
      </div>
      {isFullscreen ? (
        <div
          className="fixed inset-0 z-[100] h-dvh overflow-hidden bg-[#050712]"
          role="dialog"
          aria-modal="true"
          style={{ paddingTop: 'env(safe-area-inset-top)', paddingBottom: 'env(safe-area-inset-bottom)' }}
        >
          {!isLandscape ? (
            <div className="flex min-h-dvh flex-col items-center justify-center gap-5 p-6 text-center">
              <div className="rounded-[2rem] border border-slate-800 bg-slate-950/80 p-6">
                <p className="text-[11px] font-black uppercase tracking-[0.24em] text-emerald-300">{t('load.chart.fullscreen')}</p>
                <h3 className="mt-2 text-2xl font-black">{t('load.chart.turnPhone')}</h3>
                <p className="mt-2 text-sm font-bold text-slate-400">{t('load.chart.landscapeNote')}</p>
              </div>
              <button type="button" onClick={closeFullscreen} className="rounded-full border border-slate-700 bg-slate-950 px-4 py-2 text-xs font-black text-slate-100">
                {t('load.chart.close')}
              </button>
            </div>
          ) : (
            <div className="flex h-full min-h-0 flex-col gap-1.5 p-2">
              <div className="flex shrink-0 items-center justify-between gap-2 px-1">
                <div className="min-w-0">
                  <p className="text-[10px] font-black uppercase tracking-[0.2em] text-emerald-300">{t('load.chart.title')}</p>
                  <p className="truncate text-sm font-black text-white">{t('load.chart.rangeEwma', { count: range })}</p>
                </div>
                <div className="flex shrink-0 items-center gap-1.5">
                  <div className="flex rounded-full border border-slate-800 bg-slate-950/80 p-0.5">
                    {fullscreenRanges.map((item) => (
                      <button
                        key={item}
                        type="button"
                        onClick={() => setRange(item)}
                        className={`rounded-full px-2.5 py-1 text-[10px] font-black transition ${range === item ? 'bg-emerald-300 text-slate-950' : 'text-slate-400'}`}
                      >
                        {t('load.chart.days', { count: item })}
                      </button>
                    ))}
                  </div>
                  <button
                    type="button"
                    onClick={() => setShowLoadLines((current) => !current)}
                    className={`rounded-full border px-2.5 py-1 text-[10px] font-black ${showLoadLines ? 'border-amber-300 bg-amber-300 text-slate-950' : 'border-slate-700 bg-slate-950 text-slate-300'}`}
                  >
                    A/C
                  </button>
                  <button
                    type="button"
                    onClick={closeFullscreen}
                    className="rounded-full border border-slate-700 bg-slate-950 px-3 py-1.5 text-[10px] font-black text-slate-100"
                  >
                    {t('load.chart.close')}
                  </button>
                </div>
              </div>
              <div className="min-h-0 flex-1 rounded-[1.25rem] border border-slate-800 bg-slate-950/70 p-1.5">
                {chart(true)}
              </div>
            </div>
          )}
        </div>
      ) : null}
    </div>
  );
}

export function WeeklyLoadProfileGraph({ entries, title }: { entries: AthleteLoadEntry[]; title?: string }) {
  const t = useT();
  const [metric, setMetric] = useState<WeeklyLoadMetric>('au');
  const [selectedWeekKey, setSelectedWeekKey] = useState<string | null>(null);
  const [isMounted, setIsMounted] = useState(false);
  const points = useMemo(() => buildWeeklyLoadProfile(entries), [entries]);
  const selectedWeek = selectedWeekKey ? points.find((point) => point.key === selectedWeekKey) ?? null : null;
  const dayPoints = useMemo(() => selectedWeekKey ? buildWeeklyLoadDayProfile(entries, selectedWeekKey) : [], [entries, selectedWeekKey]);
  const meta = WEEKLY_LOAD_METRICS[metric];
  const domain = weeklyLoadDomain(points, metric);
  const dayDomain = weeklyLoadDomain(dayPoints, metric);

  useEffect(() => {
    setIsMounted(true);
  }, []);

  useEffect(() => {
    if (!selectedWeekKey) return;
    const previous = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setSelectedWeekKey(null);
    };
    window.addEventListener('keydown', onKeyDown);
    return () => {
      window.removeEventListener('keydown', onKeyDown);
      document.body.style.overflow = previous;
    };
  }, [selectedWeekKey]);

  function selectWeek(payload?: WeeklyLoadProfilePoint) {
    if (!payload?.key) return;
    setSelectedWeekKey((current) => current === payload.key ? null : payload.key);
  }

  function selectWeekFromRechartsPayload(payload: unknown) {
    const direct = payload as WeeklyLoadProfilePoint | undefined;
    const nested = (payload as { payload?: WeeklyLoadProfilePoint } | undefined)?.payload;
    selectWeek(nested ?? direct);
  }

  return (
    <div className="rounded-2xl border border-slate-800 bg-slate-950/75 p-3">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          {title === '' ? null : <p className="text-[10px] font-black uppercase tracking-[0.18em] text-slate-500">{title ?? t('load.week.defaultTitle')}</p>}
          <p className={`${title === '' ? '' : 'mt-1 '}text-sm font-bold text-slate-300`}>{t('load.week.tapHint')}</p>
        </div>
        <div className="flex flex-wrap gap-1.5">
          {(Object.keys(WEEKLY_LOAD_METRICS) as WeeklyLoadMetric[]).map((item) => (
            <button
              key={item}
              type="button"
              onClick={() => setMetric(item)}
              className={`rounded-full border px-2.5 py-1 text-[11px] font-black transition ${metric === item ? 'border-emerald-300 bg-emerald-300 text-slate-950' : 'border-slate-700 text-slate-300 hover:border-slate-500'}`}
            >
              {t(WEEKLY_LOAD_METRICS[item].label)}
            </button>
          ))}
        </div>
      </div>
      <div className="mt-3 h-72 sm:h-72">
        {!isMounted ? (
          <div className="h-full rounded-xl border border-slate-800 bg-slate-950/60" />
        ) : (
        <ResponsiveContainer width="100%" height="100%">
          <ComposedChart
            data={points}
            margin={{ top: 14, right: 8, bottom: 8, left: 0 }}
            onClick={(state: unknown) => {
              selectWeekFromRechartsPayload((state as { activePayload?: Array<{ payload?: WeeklyLoadProfilePoint }> } | null)?.activePayload?.[0]?.payload);
            }}
            barCategoryGap="18%"
          >
            <CartesianGrid stroke="rgba(148,163,184,0.12)" vertical={false} />
            <XAxis dataKey="label" tick={{ fill: '#94a3b8', fontSize: 11, fontWeight: 800 }} axisLine={false} tickLine={false} />
            <YAxis
              domain={domain}
              tick={{ fill: '#94a3b8', fontSize: 11, fontWeight: 800 }}
              axisLine={false}
              tickLine={false}
              width={42}
              tickFormatter={(value) => metric === 'acwr' ? formatDecimal(Number(value), 1) : `${Math.round(Number(value))}`}
            />
            <Tooltip
              cursor={{ stroke: 'rgba(148,163,184,0.2)' }}
              contentStyle={{ background: '#020617', border: '1px solid rgba(148,163,184,0.25)', borderRadius: 16 }}
              labelStyle={{ color: '#e2e8f0', fontWeight: 900 }}
              labelFormatter={(label) => {
                const point = points.find((candidate) => candidate.label === label);
                return point ? `${point.label} / ${point.dateRange}` : label;
              }}
              formatter={(value) => {
                const numeric = typeof value === 'number' ? value : Number(value);
                return [Number.isFinite(numeric) ? (metric === 'acwr' || metric === 'rpe' ? formatDecimal(numeric, 1) : Math.round(numeric)) : '-', t(meta.unit)];
              }}
            />
            {metric === 'acwr' ? (
              <>
                <ReferenceLine y={ACWR_ZONES.low} stroke="#38bdf8" strokeDasharray="5 6" strokeOpacity={0.62} />
                <ReferenceLine y={ACWR_ZONES.high} stroke="#fb7185" strokeDasharray="5 6" strokeOpacity={0.62} />
              </>
            ) : null}
            <Bar
              dataKey={meta.dataKey}
              fill={meta.color}
              radius={[10, 10, 4, 4]}
              maxBarSize={42}
              className="cursor-pointer"
            />
            <Line
              type="monotone"
              dataKey={meta.dataKey}
              stroke={meta.color}
              strokeWidth={2}
              strokeOpacity={0.58}
              dot={{ r: 3, fill: '#020617', stroke: meta.color, strokeWidth: 2 }}
              activeDot={{ r: 5, fill: '#f8fafc', stroke: meta.color, strokeWidth: 2 }}
            />
          </ComposedChart>
        </ResponsiveContainer>
        )}
      </div>
      {selectedWeek ? (
        <div className="fixed inset-0 z-[120] flex items-end justify-center bg-slate-950/82 p-3 backdrop-blur-xl sm:items-center sm:p-6" role="dialog" aria-modal="true" aria-labelledby="weekly-load-detail-title" onClick={() => setSelectedWeekKey(null)}>
          <div className="max-h-[90vh] w-full max-w-3xl overflow-y-auto rounded-[1.75rem] border border-slate-700 bg-slate-950 p-4 text-white shadow-[0_30px_120px_rgba(0,0,0,0.55)] sm:rounded-[2rem] sm:p-5" onClick={(event) => event.stopPropagation()}>
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="text-[10px] font-black uppercase tracking-[0.2em] text-emerald-300">{t('load.week.detail')}</p>
                <h3 id="weekly-load-detail-title" className="mt-1 text-2xl font-black">{selectedWeek.label}</h3>
                <p className="mt-1 text-sm font-bold text-slate-500">{selectedWeek.dateRange} · {t('load.week.sessions', { count: selectedWeek.sessions })}</p>
              </div>
              <button type="button" onClick={() => setSelectedWeekKey(null)} className="rounded-2xl border border-slate-700 px-4 py-2 text-sm font-black text-slate-200 transition hover:border-emerald-300/50">
                {t('load.week.close')}
              </button>
            </div>
            <div className="mt-4 flex flex-wrap gap-1.5">
              {(Object.keys(WEEKLY_LOAD_METRICS) as WeeklyLoadMetric[]).map((item) => (
                <button
                  key={item}
                  type="button"
                  onClick={() => setMetric(item)}
                  className={`rounded-full border px-3 py-1.5 text-[11px] font-black transition ${metric === item ? 'border-emerald-300 bg-emerald-300 text-slate-950' : 'border-slate-700 text-slate-300 hover:border-slate-500'}`}
                >
                  {t(WEEKLY_LOAD_METRICS[item].label)}
                </button>
              ))}
            </div>
            <div className="mt-4 rounded-2xl border border-slate-800 bg-slate-950/75 p-3">
              <div className="grid grid-cols-7 items-end gap-1.5 sm:gap-2">
                {dayPoints.map((day) => {
                  const rawValue = day[meta.dataKey];
                  const value = typeof rawValue === 'number' && Number.isFinite(rawValue) ? rawValue : null;
                  const max = dayDomain[1] || 1;
                  const height = value === null ? 4 : Math.max(10, Math.round((Math.min(value, max) / max) * 170));
                  return (
                    <div key={day.key} className="min-w-0 text-center" title={`${day.label}: ${value === null ? '-' : metric === 'acwr' || metric === 'rpe' ? formatDecimal(value, 1) : Math.round(value)}`}>
                      <div className="flex h-44 items-end justify-center rounded-xl border border-slate-800 bg-slate-900/55 px-1 py-1.5">
                        <div className="w-full max-w-9 rounded-t-lg" style={{ height, backgroundColor: meta.color, opacity: value === null ? 0.16 : 0.86 }} />
                      </div>
                      <p className="mt-1 truncate text-[10px] font-black text-slate-300">{day.label}</p>
                      <p className="text-[9px] font-bold text-slate-600">{value === null ? '-' : metric === 'acwr' || metric === 'rpe' ? formatDecimal(value, 1) : Math.round(value)}</p>
                    </div>
                  );
                })}
              </div>
              {metric === 'acwr' ? (
                <div className="mt-3 flex items-center gap-3 text-[10px] font-black text-slate-500">
                  <span className="inline-flex items-center gap-1"><span className="h-px w-5 border-t border-dashed border-sky-300" />{t('load.week.low', { value: formatDecimal(ACWR_ZONES.low, 1) })}</span>
                  <span className="inline-flex items-center gap-1"><span className="h-px w-5 border-t border-dashed border-rose-300" />{t('load.week.high', { value: formatDecimal(ACWR_ZONES.high, 1) })}</span>
                </div>
              ) : null}
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
