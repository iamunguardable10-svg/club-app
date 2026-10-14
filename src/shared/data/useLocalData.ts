'use client';

/**
 * React access to the local database.
 *
 * Subscribes to the repository so a change made in one view appears in the
 * other without a reload — the coach sees an athlete's cancellation the moment
 * it is entered. Reading on mount alone would not do that.
 *
 * The hook returns null during server rendering and while the page hydrates,
 * which keeps hydration consistent; callers render a loading state for that
 * one frame. Every later mount (switching tabs, opening a sheet, going back)
 * reads the document the page already holds and shows it in its first frame,
 * without a loading phase.
 */

import { useSyncExternalStore } from 'react';

import { getBackendStatus, readDatabase, subscribe, type BackendStatus } from './repository';
import { LocalDataError, type LocalDatabase } from './schema';

type LocalDataState = {
  database: LocalDatabase | null;
  error: LocalDataError | null;
  /** False until the first client-side read has happened. */
  ready: boolean;
};

/** What the pages show instead of data while the server has none for this person. */
const BACKEND_MESSAGES: Partial<Record<BackendStatus['phase'], { text: string; key: string }>> = {
  signedOut: { text: 'Not signed in.', key: 'data.signedOut' },
  unlinked: { text: 'Your account is not part of a team yet.', key: 'data.unlinked' },
  error: { text: 'Could not load the data from the server.', key: 'data.loadFailed' },
};

const NOT_READY: LocalDataState = { database: null, error: null, ready: false };

/** Reads the current state; the same object while nothing changed (useSyncExternalStore needs that). */
let lastState: LocalDataState = NOT_READY;
let lastKey: unknown[] = [];

function sameKey(next: unknown[]) {
  return next.length === lastKey.length && next.every((value, index) => Object.is(value, lastKey[index]));
}

function currentState(): LocalDataState {
  let next: LocalDataState;
  let key: unknown[];
  try {
    const database = readDatabase();
    const backend = getBackendStatus();
    key = [database, backend.phase, backend.error];
    if (sameKey(key)) return lastState;
    if (backend.phase === 'loading') {
      next = NOT_READY;
    } else {
      const message = BACKEND_MESSAGES[backend.phase];
      if (message) {
        const error = backend.error
          ? new LocalDataError(`${message.text} (${backend.error})`, undefined, 'data.withDetail', { message: message.key, detail: backend.error })
          : new LocalDataError(message.text, undefined, message.key);
        next = { database: null, error, ready: true };
      } else {
        next = { database, error: null, ready: true };
      }
    }
  } catch (error) {
    // Surfaced, never swallowed: a broken document must not look like an
    // empty club.
    key = ['error', error];
    if (sameKey(key)) return lastState;
    next = {
      database: null,
      error: error instanceof LocalDataError ? error : new LocalDataError('Could not read the local database.', error, 'data.readFailed'),
      ready: true,
    };
  }
  lastKey = key;
  lastState = next;
  return next;
}

const serverState = () => NOT_READY;

export function useLocalDatabase(): LocalDataState {
  return useSyncExternalStore(subscribe, currentState, serverState);
}

/**
 * Where the data comes from, whether changes are still on their way to the
 * server and whether the server refused the last one. Local mode: always
 * ready, nothing pending.
 */
let lastStatus: BackendStatus | null = null;

function currentStatus(): BackendStatus {
  const next = getBackendStatus();
  if (lastStatus && (Object.keys(next) as (keyof BackendStatus)[]).every((key) => Object.is(next[key], lastStatus?.[key]))) return lastStatus;
  lastStatus = next;
  return next;
}

/**
 * While the page hydrates the server's HTML: nothing known yet. Screens show
 * their loading state for that one frame, as they did on the server.
 */
const HYDRATING_STATUS: BackendStatus = { mode: 'local', phase: 'loading', error: null, rejected: null, rejectedNotice: null, pending: 0, offline: false, savedAt: null };

export function useBackendStatus(): BackendStatus {
  return useSyncExternalStore(subscribe, currentStatus, () => HYDRATING_STATUS);
}
