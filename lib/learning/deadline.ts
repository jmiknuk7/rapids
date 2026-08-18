import type { CardProgress } from "./types";
import { DAY_MS } from "./types";
import { minDaysToDurable, CRITERION_CORRECT_DAYS } from "./criterion";

/**
 * Deadline-aware scheduling (Amendment A1). The engine optimizes for peak
 * retention on one specific date, not generic long-term retention.
 *
 * Gap rule: while daysToExam is under ~6 weeks, target the inter-review gap
 * at roughly 20% of daysToExam — take min(fsrsInterval, 0.2 · daysToExam),
 * never letting the gap collapse below 1 day. Hard clamp: no card is ever
 * scheduled past examDate − 1; every card gets at least one review inside
 * the window.
 *
 * Citation (rendered on /method with this caveat stated plainly): Cepeda,
 * Vul, Rohrer, Wixted & Pashler (2008), Psychological Science 19(11),
 * 1095–1102, doi:10.1111/j.1467-9280.2008.02209.x — the optimal inter-study
 * gap is a proportion of the retention interval, roughly 20% of test delay
 * at delays of a few weeks, declining to 5–10% at a one-year delay. This is
 * an adaptation of a two-session laboratory finding to a multi-session
 * scheduler, not a directly validated implementation.
 */

export const GAP_RATIO = 0.2;
export const GAP_RULE_WINDOW_DAYS = 42; // "~6 weeks"
export const CONSOLIDATION_FRACTION = 0.2; // final 20% of the window

/** UTC midnight of an ISO date (YYYY-MM-DD). */
export const isoToEpoch = (isoDate: string): number => Date.parse(`${isoDate}T00:00:00Z`);

/** Whole days from `now` until exam-day midnight (0 = exam day). */
export function daysToExam(now: number, examDate: string): number {
  return Math.floor((isoToEpoch(examDate) - now) / DAY_MS);
}

/**
 * Clamp an FSRS-proposed interval (days) against the exam date.
 * examDate === null → interval passes through unchanged; the dashboard is
 * responsible for prompting for a date (Amendment A6) — this function never
 * invents a horizon.
 */
export function clampInterval(
  fsrsIntervalDays: number,
  now: number,
  examDate: string | null,
): number {
  if (examDate === null) return fsrsIntervalDays;
  const dte = daysToExam(now, examDate);
  // Hard clamp: never past examDate − 1. On exam eve (dte ≤ 1) this floors
  // to 0 — review again today rather than never or after the exam.
  const hardMax = Math.max(0, dte - 1);
  let interval = Math.min(fsrsIntervalDays, hardMax);
  if (dte > 1 && dte < GAP_RULE_WINDOW_DAYS) {
    // 20%-of-window target gap; the max(1, …) keeps the RULE from pushing a
    // gap below 1 day (Cepeda et al. 2008). FSRS's own sub-day learning
    // steps pass through untouched — the floor constrains the rule, not FSRS.
    interval = Math.min(interval, Math.max(1, GAP_RATIO * dte));
  }
  return interval;
}

/**
 * Consolidation mode (Amendment A1): in the final 20% of the window between
 * when the exam date was set and the exam itself, stop introducing New
 * cards; the queue shifts to Maintenance + Blind Spots only. The start date
 * is deterministic so the dashboard can surface it in advance.
 */
export function consolidationStart(examDateSetAt: string, examDate: string): string {
  const set = isoToEpoch(examDateSetAt);
  const exam = isoToEpoch(examDate);
  const start = set + (1 - CONSOLIDATION_FRACTION) * (exam - set);
  // Round DOWN to a calendar day: consolidation begins on, not after, the boundary.
  return new Date(Math.floor(start / DAY_MS) * DAY_MS).toISOString().slice(0, 10);
}

export function inConsolidation(now: number, examDateSetAt: string, examDate: string): boolean {
  const start = isoToEpoch(consolidationStart(examDateSetAt, examDate));
  return now >= start && now < isoToEpoch(examDate);
}

/** Days a card still needs (one correct recall per calendar day) to reach Criterion. */
export function minDaysToCriterion(p: CardProgress): number {
  if (p.state === "new") return CRITERION_CORRECT_DAYS;
  if (p.state === "learning") return CRITERION_CORRECT_DAYS - p.correctDays.length;
  return 0;
}

export interface AtRiskResult {
  atRiskIds: Set<string>;
  /** Total review-slots demanded vs available before the exam. */
  demand: number;
  capacity: number;
}

/**
 * Cards that cannot reach Criterion before the exam date at the current
 * daily volume (Amendment A1). Two mechanisms, both honest:
 *  - timeline: the card needs more separate calendar days than remain;
 *  - volume: daily-review capacity (dailyTarget × daysToExam) cannot cover
 *    every card's remaining work — closest-to-done cards get slots first,
 *    the overflow is marked, never silently dropped.
 */
export function computeAtRisk(
  progress: CardProgress[],
  now: number,
  examDate: string,
  dailyReviewTarget: number,
): AtRiskResult {
  const dte = daysToExam(now, examDate);
  const atRiskIds = new Set<string>();
  const pending = progress.filter((p) => p.state !== "durable");

  let demand = 0;
  for (const p of pending) demand += minDaysToDurable(p);
  let capacity = Math.max(0, dailyReviewTarget * dte);

  // Timeline check against Criterion (per the amendment's wording).
  for (const p of pending) {
    if (minDaysToCriterion(p) > Math.max(0, dte)) atRiskIds.add(p.cardId);
  }

  // Volume check: allocate capacity closest-first.
  const byNeed = [...pending].sort((a, b) => minDaysToDurable(a) - minDaysToDurable(b));
  let remaining = capacity;
  for (const p of byNeed) {
    const need = minDaysToDurable(p);
    if (need <= remaining) remaining -= need;
    else atRiskIds.add(p.cardId);
  }

  return { atRiskIds, demand, capacity };
}
