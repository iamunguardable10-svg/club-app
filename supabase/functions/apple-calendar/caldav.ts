// A small CalDAV client for iCloud (piece 20), plain fetch, no libraries, so
// it runs in the Edge Function (Deno) and in the tests (Node) alike.
//
// iCloud specifics it copes with: the calendars live on another host than
// caldav.icloud.com (p42-caldav.icloud.com), and a redirect to it must keep
// the sign-in, which fetch drops on its own; XML with and without prefixes.

export type DavAccount = {
  /** e.g. https://caldav.icloud.com/ */
  baseUrl: string;
  username: string;
  password: string;
};

export type DavCalendar = {
  url: string;
  name: string;
  color: string | null;
  /** Only calendars that hold events (not reminder lists). */
  events: boolean;
};

export class DavError extends Error {
  constructor(message: string, readonly status: number) {
    super(message);
    this.name = 'DavError';
  }
}

function basicAuth(account: DavAccount) {
  const bytes = new TextEncoder().encode(`${account.username}:${account.password}`);
  let binary = '';
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return `Basic ${btoa(binary)}`;
}

/** One request; follows redirects itself so the sign-in goes along. */
export async function davRequest(
  account: DavAccount,
  method: string,
  url: string,
  body?: string,
  headers: Record<string, string> = {},
): Promise<{ status: number; text: string; url: string; etag: string | null }> {
  let target = url;
  for (let hop = 0; hop < 5; hop += 1) {
    const response = await fetch(target, {
      method,
      redirect: 'manual',
      headers: {
        Authorization: basicAuth(account),
        ...(body ? { 'Content-Type': headers['Content-Type'] ?? 'application/xml; charset=utf-8' } : {}),
        ...headers,
      },
      body,
    });
    if (response.status >= 300 && response.status < 400 && response.headers.get('location')) {
      target = new URL(response.headers.get('location')!, target).toString();
      await response.body?.cancel();
      continue;
    }
    const text = await response.text();
    if (response.status === 401) throw new DavError('Apple did not accept the Apple ID or the app-specific password.', 401);
    return { status: response.status, text, url: target, etag: response.headers.get('etag') };
  }
  throw new DavError('Too many redirects.', 310);
}

// --- XML, tolerant of namespace prefixes -------------------------------------

function tag(name: string) {
  return `(?:[A-Za-z0-9_-]+:)?${name}`;
}

/** The inner text of each <name>…</name> (any prefix). */
export function elements(xml: string, name: string): string[] {
  const pattern = new RegExp(`<${tag(name)}(?:\\s[^>]*)?>([\\s\\S]*?)</${tag(name)}>`, 'g');
  return [...xml.matchAll(pattern)].map((match) => match[1]);
}

function first(xml: string, name: string): string | null {
  return elements(xml, name)[0] ?? null;
}

function has(xml: string, name: string): boolean {
  return new RegExp(`<${tag(name)}[\\s/>]`).test(xml);
}

export function xmlUnescape(value: string): string {
  return value
    .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, '$1')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&#13;/g, '\r')
    .replace(/&#10;/g, '\n')
    .replace(/&amp;/g, '&');
}

function xmlEscape(value: string): string {
  return value.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

// --- Discovery ------------------------------------------------------------------

/** The account's calendar home (absolute URL). */
export async function discoverCalendarHome(account: DavAccount): Promise<string> {
  const principalResponse = await davRequest(account, 'PROPFIND', account.baseUrl,
    '<?xml version="1.0" encoding="utf-8"?><d:propfind xmlns:d="DAV:"><d:prop><d:current-user-principal/></d:prop></d:propfind>',
    { Depth: '0' });
  const principalHref = first(first(principalResponse.text, 'current-user-principal') ?? '', 'href');
  if (!principalHref) throw new DavError('Could not find the calendar account.', principalResponse.status);
  const principal = new URL(xmlUnescape(principalHref.trim()), principalResponse.url).toString();

  const homeResponse = await davRequest(account, 'PROPFIND', principal,
    '<?xml version="1.0" encoding="utf-8"?><d:propfind xmlns:d="DAV:" xmlns:c="urn:ietf:params:xml:ns:caldav"><d:prop><c:calendar-home-set/></d:prop></d:propfind>',
    { Depth: '0' });
  const homeHref = first(first(homeResponse.text, 'calendar-home-set') ?? '', 'href');
  if (!homeHref) throw new DavError('Could not find the calendars.', homeResponse.status);
  return new URL(xmlUnescape(homeHref.trim()), homeResponse.url).toString();
}

export async function listCalendars(account: DavAccount, home: string): Promise<DavCalendar[]> {
  const response = await davRequest(account, 'PROPFIND', home,
    '<?xml version="1.0" encoding="utf-8"?><d:propfind xmlns:d="DAV:" xmlns:c="urn:ietf:params:xml:ns:caldav" xmlns:a="http://apple.com/ns/ical/">'
      + '<d:prop><d:resourcetype/><d:displayname/><a:calendar-color/><c:supported-calendar-component-set/></d:prop></d:propfind>',
    { Depth: '1' });
  return elements(response.text, 'response')
    .map((entry) => {
      const href = first(entry, 'href');
      const type = first(entry, 'resourcetype') ?? '';
      if (!href || !has(type, 'calendar')) return null;
      const components = first(entry, 'supported-calendar-component-set');
      const events = components === null || /name=["']VEVENT["']/.test(components);
      const color = first(entry, 'calendar-color');
      return {
        url: new URL(xmlUnescape(href.trim()), response.url).toString(),
        name: xmlUnescape((first(entry, 'displayname') ?? '').trim()) || 'Calendar',
        color: color ? color.trim().slice(0, 7) : null,
        events,
      } satisfies DavCalendar;
    })
    .filter((calendar): calendar is DavCalendar => calendar !== null);
}

/** Makes a calendar for events in the home and returns its URL. */
export async function makeCalendar(account: DavAccount, home: string, name: string, color = '#34D399'): Promise<string> {
  const url = new URL(`${crypto.randomUUID()}/`, home).toString();
  const response = await davRequest(account, 'MKCALENDAR', url,
    '<?xml version="1.0" encoding="utf-8"?><c:mkcalendar xmlns:d="DAV:" xmlns:c="urn:ietf:params:xml:ns:caldav" xmlns:a="http://apple.com/ns/ical/">'
      + `<d:set><d:prop><d:displayname>${xmlEscape(name)}</d:displayname><a:calendar-color>${color}</a:calendar-color>`
      + '<c:supported-calendar-component-set><c:comp name="VEVENT"/></c:supported-calendar-component-set></d:prop></d:set></c:mkcalendar>');
  if (response.status !== 201) throw new DavError(`Could not create the calendar (${response.status}).`, response.status);
  return url;
}

function eventUrl(calendarUrl: string, uid: string) {
  return new URL(`${encodeURIComponent(uid)}.ics`, calendarUrl.endsWith('/') ? calendarUrl : `${calendarUrl}/`).toString();
}

export async function putEvent(account: DavAccount, calendarUrl: string, uid: string, ics: string): Promise<void> {
  const response = await davRequest(account, 'PUT', eventUrl(calendarUrl, uid), ics, { 'Content-Type': 'text/calendar; charset=utf-8' });
  if (response.status >= 300) throw new DavError(`Could not save an event (${response.status}).`, response.status);
}

export async function deleteEvent(account: DavAccount, calendarUrl: string, uid: string): Promise<void> {
  const response = await davRequest(account, 'DELETE', eventUrl(calendarUrl, uid));
  if (response.status >= 300 && response.status !== 404) throw new DavError(`Could not delete an event (${response.status}).`, response.status);
}

function davTime(date: Date) {
  return date.toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '');
}

/**
 * The events of a calendar between two times as iCalendar texts. Asks the
 * server to expand repeating events into single ones.
 */
export async function queryEvents(account: DavAccount, calendarUrl: string, from: Date, to: Date): Promise<string[]> {
  const range = `start="${davTime(from)}" end="${davTime(to)}"`;
  const response = await davRequest(account, 'REPORT', calendarUrl,
    '<?xml version="1.0" encoding="utf-8"?><c:calendar-query xmlns:d="DAV:" xmlns:c="urn:ietf:params:xml:ns:caldav">'
      + `<d:prop><c:calendar-data><c:expand ${range}/></c:calendar-data></d:prop>`
      + `<c:filter><c:comp-filter name="VCALENDAR"><c:comp-filter name="VEVENT"><c:time-range ${range}/></c:comp-filter></c:comp-filter></c:filter>`
      + '</c:calendar-query>',
    { Depth: '1' });
  if (response.status >= 300) throw new DavError(`Could not read a calendar (${response.status}).`, response.status);
  return elements(response.text, 'calendar-data').map(xmlUnescape);
}
