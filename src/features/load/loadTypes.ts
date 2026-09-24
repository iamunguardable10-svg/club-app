/**
 * Moved to `@/shared/data/loadTypes` in the simplification work (run 1).
 *
 * Load types and the calculations on them belong to the data layer, not to a
 * feature folder: both the coach and the athlete side depend on them. This
 * shim keeps the existing imports working; new code should import from
 * `@/shared/data`.
 */
export * from '@/shared/data/loadTypes';
