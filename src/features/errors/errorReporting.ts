/**
 * Sends errors to the server (piece 13), cleaned and bounded:
 * - no content: page path without query or hash, messages without e-mail
 *   addresses, URLs cut at "?" (invite codes and tokens live there);
 * - the server cleans again and counts repeats instead of adding rows;
 * - per page load each message goes once, and at most 20 in total, so a
 *   render loop cannot flood anything.
 * Reporting never throws: a failed report is dropped.
 */

import { isRemoteMode, readDatabase, sendErrorReport, sendProblemReport, type ErrorReportKind, type ReportContext } from '@/shared/data';

const MAX_PER_PAGE_LOAD = 20;
const sent = new Set<string>();

export function clean(text: string, max: number): string {
  return text
    .replace(/[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/g, '(email)')
    .replace(/(https?:\/\/[^\s?#]+)[?#][^\s)]*/g, '$1')
    .trim()
    .slice(0, max);
}

function deviceName(): string {
  if (typeof navigator === 'undefined') return '';
  const ua = navigator.userAgent;
  const platform = /iPhone/.test(ua) ? 'iPhone' : /iPad/.test(ua) ? 'iPad' : /Android/.test(ua) ? 'Android'
    : /Mac OS X/.test(ua) ? 'Mac' : /Windows/.test(ua) ? 'Windows' : /Linux/.test(ua) ? 'Linux' : 'Other';
  const browser = /Edg\//.test(ua) ? 'Edge' : /CriOS|Chrome\//.test(ua) ? 'Chrome' : /FxiOS|Firefox\//.test(ua) ? 'Firefox'
    : /Safari\//.test(ua) ? 'Safari' : 'Browser';
  const installed = typeof window !== 'undefined' && window.matchMedia?.('(display-mode: standalone)').matches;
  return `${platform} · ${browser}${installed ? ' · app' : ''}`;
}

export function reportContext(): ReportContext {
  let role: ReportContext['role'] = null;
  try {
    role = readDatabase()?.activeIdentity?.role ?? null;
  } catch {
    role = null;
  }
  return {
    page: typeof window === 'undefined' ? '' : window.location.pathname,
    role,
    mode: isRemoteMode() ? 'server' : 'demo',
    version: process.env.NEXT_PUBLIC_APP_VERSION ?? 'local',
    device: deviceName(),
  };
}

function describe(error: unknown): { message: string; detail: string | null } {
  if (error instanceof Error) {
    const digest = (error as Error & { digest?: string }).digest;
    return { message: `${error.name}: ${error.message}${digest ? ` (digest ${digest})` : ''}`, detail: error.stack ?? null };
  }
  return { message: typeof error === 'string' ? error : JSON.stringify(error) ?? String(error), detail: null };
}

export function reportError(kind: ErrorReportKind, error: unknown): void {
  try {
    const { message, detail } = describe(error);
    const text = clean(message, 500) || 'Unknown error';
    const key = `${kind}|${text}`;
    if (sent.has(key) || sent.size >= MAX_PER_PAGE_LOAD) return;
    sent.add(key);
    void sendErrorReport(kind, text, detail ? clean(detail, 4000) : null, reportContext()).catch(() => undefined);
  } catch {
    // Reporting must never cause an error of its own.
  }
}

export function reportProblem(text: string): Promise<void> {
  return sendProblemReport(text, reportContext());
}
