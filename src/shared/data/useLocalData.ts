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

import { readDatabase, subscribe } from './repository';
import { LocalDataError, type LocalDatabase } from './schema';

type LocalDataState = {
  database: LocalDatabase | null;
  error: LocalDataError | null;
  /** False until the first client-side read has happened. */
  ready: boolean;
};

export function useLocalDatabase(): LocalDataState {
  const [state, setState] = useState<LocalDataState>({ database: null, error: null, ready: false });

  const read = useCallback(() => {
    try {
      setState({ database: readDatabase(), error: null, ready: true });
    } catch (error) {
      // Surfaced, never swallowed: a broken document must not look like an
      // empty club.
      setState({
        database: null,
        error: error instanceof LocalDataError ? error : new LocalDataError('Could not read the local database.', error),
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
