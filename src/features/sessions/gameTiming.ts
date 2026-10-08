/** Games keep a calendar duration, while people only see kick-off. */
export function gameDurationMinutes(startsAt: string, endsAt?: string | null): number {
  const duration = endsAt ? (Date.parse(endsAt) - Date.parse(startsAt)) / 60_000 : 0;
  return Number.isFinite(duration) && duration > 0 ? duration : 120;
}

export function gameEndAt(startsAt: string, durationMinutes = 120): string {
  return new Date(Date.parse(startsAt) + durationMinutes * 60_000).toISOString();
}

/** Time-only weekly templates can run past midnight. */
export function gameTemplateDuration(startTime: string, endTime: string): number {
  const minutes = (time: string) => { const [h, m] = time.split(':').map(Number); return h * 60 + m; };
  const duration = (minutes(endTime) - minutes(startTime) + 1440) % 1440;
  return Number.isFinite(duration) && duration > 0 ? duration : 120;
}

export function gameTemplateEnd(startTime: string, durationMinutes = 120): string {
  const [hours, minutes] = startTime.split(':').map(Number);
  const end = (hours * 60 + minutes + durationMinutes) % 1440;
  return `${String(Math.floor(end / 60)).padStart(2, '0')}:${String(end % 60).padStart(2, '0')}`;
}
