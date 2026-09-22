/**
 * Moved to `@/shared/data/loadCalculations` in the simplification work (run 1).
 *
 * The ACWR, EWMA, monotony and strain maths are sound and were kept as they
 * were; only their location changed. This shim keeps the existing imports
 * working; new code should import from `@/shared/data`.
 */
export * from '@/shared/data/loadCalculations';
