/**
 * Rapids learning engine — pure, unit-tested functions, independent of
 * React and of persistence. Every mechanic is grounded in published
 * research, cited in the module that implements it and rendered on /method:
 *
 * - FSRS scheduling ............ fsrs.ts (srs-benchmark; ts-fsrs)
 * - Successive relearning ...... criterion.ts (Rawson & Dunlosky et al.)
 * - Deadline-aware scheduling .. deadline.ts (Cepeda et al. 2008, adapted)
 * - Confidence calibration ..... calibration.ts (Frontiers 2026; Tobias & Everson)
 * - Weighted interleaving ...... interleave.ts (Rohrer & Taylor 2007)
 * - Coverage & familiarity ..... coverage.ts (Amendment A7)
 * - Readiness .................. readiness.ts (honest, floored, cappable)
 */
export * from "./types";
export * from "./criterion";
export * from "./fsrs";
export * from "./deadline";
export * from "./calibration";
export * from "./coverage";
export * from "./interleave";
export * from "./readiness";
export * from "./rng";
