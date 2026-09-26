// Writes a push message in the recipient's language (App languages, 6b).
//
// The database stores every message in English plus a text key and its
// values (migration 0031). For an account in another language this builds
// title and body again from the app's texts (push-texts.json, made by
// `npm run push-texts` from src/shared/i18n/messages). Each builder mirrors
// the SQL that wrote the English text; a missing translation falls back to
// English for that text. No Deno APIs here, so the app's tests run it too.

export type PushTexts = {
  /** Stored English titles ("Team training") and their text keys. */
  titles: Record<string, string>;
  locales: Record<string, { intl: string; texts: Record<string, string> }>;
};

type Params = Record<string, unknown>;
type Translate = (key: string, values?: Record<string, string | number>) => string;
export type PushFormat = {
  /** "Sun 27 Sep, 12:33" (club time). */
  when: (iso: string) => string;
  /** "12:33" (club time). */
  time: (iso: string) => string;
  /** "Sun 27 Sep" for a date without time. */
  day: (date: string) => string;
};

const CLUB_TIME_ZONE = 'Europe/Berlin';

function fill(text: string, values: Record<string, string | number> = {}) {
  return text.replace(/\{(\w+)\}/g, (match, name: string) => (values[name] !== undefined ? String(values[name]) : match));
}

const str = (value: unknown) => (value === null || value === undefined ? '' : String(value));
const joinDot = (parts: (string | null | false | undefined)[]) => parts.filter((part): part is string => Boolean(part)).join(' · ');

/** The builders, one per text key; `stored` is the English message (the message body of a team message stays as written). */
export function buildPush(t: Translate, format: PushFormat, titles: Record<string, string>, key: string, params: Params, stored: { title: string; body: string }): { title: string; body: string } | null {
  const title = (value: unknown) => (titles[str(value)] ? t(titles[str(value)]) : str(value));
  const what = () => (params.opponent ? t('push.vs', { title: title(params.title), opponent: str(params.opponent) }) : title(params.title));
  const meet = () => {
    const minutes = typeof params.meet_minutes === 'number' ? params.meet_minutes : null;
    const point = str(params.meet_point);
    const time = minutes !== null ? format.time(new Date(new Date(str(params.at)).getTime() - minutes * 60_000).toISOString()) : '';
    if (time && point) return t('push.meet.timePoint', { time, point });
    if (time) return t('push.meet.time', { time });
    if (point) return t('push.meet.point', { point });
    return null;
  };

  switch (key) {
    case 'push.reminder':
      return { title: t('push.reminder.title'), body: t('push.reminder.body', { team: str(params.team), title: title(params.title), when: format.when(str(params.at)) }) };
    case 'push.summary':
      return {
        title: t('push.summary.title', { team: str(params.team), title: title(params.title), time: format.time(str(params.at)) }),
        body: joinDot([
          t('push.summary.in', { count: Number(params.in) }),
          Number(params.late) > 0 && t('push.summary.late', { count: Number(params.late) }),
          t('push.summary.out', { count: Number(params.out) }),
          t('push.summary.open', { count: Number(params.open) }),
        ]),
      };
    case 'push.rate':
      return { title: t('push.rate.title'), body: t('push.rate.body', { title: title(params.title), team: str(params.team) }) };
    case 'push.changed': {
      const place = params.facility ? str(params.facility) : params.away ? str(params.venue) || t('push.away') : null;
      return {
        title: t('push.changed.title', { team: str(params.team) }),
        body: joinDot([t('push.changed.when', { what: what(), when: format.when(str(params.at)), end: format.time(str(params.ends_at)) }), place, meet()]),
      };
    }
    case 'push.cancelled':
      return { title: t('push.cancelled.title', { team: str(params.team) }), body: t('push.cancelled.body', { what: what(), when: format.when(str(params.at)) }) };
    case 'push.review': {
      const entry = t('push.review.entry', { title: title(params.title), date: format.day(str(params.date)), rpe: str(params.rpe), minutes: str(params.minutes) });
      const text = params.coach ? t('push.review.byCoach', { coach: str(params.coach), entry }) : t('push.review.byTeam', { entry });
      return { title: t('push.review.title'), body: params.note ? t('push.review.note', { text, note: str(params.note) }) : text };
    }
    case 'push.squad': {
      const status = str(params.status);
      return {
        title: t(status === 'squad' ? 'push.squad.in' : status === 'reserve' ? 'push.squad.reserve' : 'push.squad.out'),
        body: joinDot([what(), format.when(str(params.at)), status !== 'not_selected' && meet()]),
      };
    }
    case 'push.message': {
      let heading = params.author ? t('push.message.titleAuthor', { team: str(params.team), author: str(params.author) }) : str(params.team);
      if (params.important) heading = t('push.message.important', { title: heading });
      if (params.reminder) heading = t('push.message.reminder', { title: heading });
      return { title: heading, body: stored.body };
    }
    case 'push.joined':
      return { title: t('push.joined.title', { team: str(params.team) }), body: t('push.joined.body', { name: str(params.name) }) };
    default:
      return null;
  }
}

export function clubFormat(intl: string): PushFormat {
  const when = new Intl.DateTimeFormat(intl, { weekday: 'short', day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit', hourCycle: 'h23', timeZone: CLUB_TIME_ZONE });
  const time = new Intl.DateTimeFormat(intl, { hour: '2-digit', minute: '2-digit', hourCycle: 'h23', timeZone: CLUB_TIME_ZONE });
  const day = new Intl.DateTimeFormat(intl, { weekday: 'short', day: '2-digit', month: 'short', timeZone: 'UTC' });
  return {
    when: (iso) => when.format(new Date(iso)),
    time: (iso) => time.format(new Date(iso)),
    day: (date) => day.format(new Date(`${date.slice(0, 10)}T00:00:00Z`)),
  };
}

/**
 * Title and body in `locale`, or null to send the stored English message
 * (English account, no language known, message not translated into it yet,
 * unknown key, or anything failing).
 */
export function renderPush(texts: PushTexts, locale: string | null | undefined, key: string | null | undefined, params: Params | null | undefined, stored: { title: string; body: string }) {
  if (!locale || locale === 'en' || !key || !params) return null;
  const target = texts.locales[locale];
  const english = texts.locales.en;
  if (!target || !english) return null;
  // Not translated yet for this message: the English one as it is (no English text with foreign dates).
  if (!Object.keys(target.texts).some((textKey) => textKey.startsWith(`${key}.`))) return null;
  const t: Translate = (textKey, values) => fill(target.texts[textKey] ?? english.texts[textKey] ?? textKey, values);
  try {
    return buildPush(t, clubFormat(target.intl), texts.titles, key, params, stored);
  } catch {
    return null;
  }
}
