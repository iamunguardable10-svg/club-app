'use client';

/**
 * React access to the local database.
 *
 * Subscribes to the repository so a change made in one view appears in the
 * other without a reload — the coach sees an athlete's cancellation the moment
 * it is entered. Reading on mount alone would not do that.
 *
 * The hook returns null during server rendering and the first client render,
 * which keeps hydration consistent. Callers render a loading state for that
 * one frame.
 */

import { useCallback, useEffect, useState } from 'react';

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

export function useLocalDatabase(): LocalDataState {
  const [state, setState] = useState<LocalDataState>({ database: null, error: null, ready: false });

  const read = useCallback(() => {
    try {
      const database = readDatabase();
      const backend = getBackendStatus();
      if (backend.phase === 'loading') {
        setState({ database: null, error: null, ready: false });
        return;
      }
      const message = BACKEND_MESSAGES[backend.phase];
      if (message) {
        const error = backend.error
          ? new LocalDataError(`${message.text} (${backend.error})`, undefined, 'data.withDetail', { message: message.key, detail: backend.error })
          : new LocalDataError(message.text, undefined, message.key);
        setState({ database: null, error, ready: true });
        return;
      }
      setState({ database, error: null, ready: true });
    } catch (error) {
      // Surfaced, never swallowed: a broken document must not look like an
      // empty club.
      setState({
        database: null,
        error: error instanceof LocalDataError ? error : new LocalDataError('Could not read the local database.', error, 'data.readFailed'),
        ready: true,
      });
    }
  }, []);

  useEffect(() => {
    read();
    return subscribe(read);
  }, [read]);

  return state;
}

/**
 * Where the data comes from, whether changes are still on their way to the
 * server and whether the server refused the last one. Local mode: always
 * ready, nothing pending.
 */
export function useBackendStatus(): BackendStatus {
  const [status, setStatus] = useState<BackendStatus>(() => getBackendStatus());
  useEffect(() => {
    const update = () => setStatus(getBackendStatus());
    update();
    return subscribe(update);
  }, []);
  return status;
}
