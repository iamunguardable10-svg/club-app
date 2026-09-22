/**
 * Public API of the local data layer.
 *
 * Import from '@/shared/data' rather than from the individual files, so the
 * internal layout can change without touching every view.
 */

export * from './schema';
export * from './loadTypes';
export * from './loadCalculations';
export * from './repository';
export { createSeedDatabase } from './seed';
export { SCHEMA_VERSION, DATABASE_KEY } from './migrations';
export { useLocalDatabase } from './useLocalData';
