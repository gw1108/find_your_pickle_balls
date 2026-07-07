// Feature flags (PLAN.md §8). Compile-time constants at MVP; move to a remote
// config table if we ever need to flip one without shipping a build.

/**
 * Texas app-store age law (in effect since May 2026, SCOTUS pending):
 * when enabled, consume Apple's Declared Age Range API and Google Play's
 * Age Signals API and reconcile them with the self-declared 18+ DOB gate.
 * OFF until the litigation settles and the store SDKs stabilize — the
 * DB-enforced 18+ gate (profiles.adults_only constraint) is the floor
 * either way.
 */
export const AGE_SIGNAL_APIS_ENABLED = false;
