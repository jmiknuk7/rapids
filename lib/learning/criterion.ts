import { createEmptyCard } from "ts-fsrs";
import type { CardProgress, CardState } from "./types";
import { CARD_STATE_ORDER, isoDay } from "./types";

/**
 * The criterion state machine — successive relearning.
 *
 * New → Learning → Criterion → Maintenance → Durable
 *
 * - A card is not "learned" after one correct recall. It reaches CRITERION
 *   only after 3 correct recalls on 3 SEPARATE calendar days.
 * - After Criterion it must be correctly relearned 3 more times at
 *   FSRS-scheduled expanding intervals: 1 relearn → Maintenance,
 *   3 relearns → Durable.
 * - Any incorrect recall drops the card back ONE state and resets its
 *   within-state streak.
 *
 * Citations (rendered on /method): Rawson, Dunlosky & Sciartelli (2013),
 * Educational Psychology Review 25(4), 523–548 — practice to a criterion of
 * 3 correct recalls, then relearn 3 times at widely spaced intervals.
 * Rawson & Dunlosky (2022), Current Directions in Psychological Science,
 * 10.1177/09637214221100484. Janes et al. (2020), Applied Cognitive
 * Psychology, 10.1002/acp.3699 (validation on a high-stakes course exam).
 */

export const CRITERION_CORRECT_DAYS = 3;
export const DURABLE_RELEARNS = 3;

export function initialProgress(
  cardId: string,
  examId: string,
  domainId: string | null,
  now: number,
): CardProgress {
  return {
    cardId,
    examId,
    domainId,
    state: "new",
    correctDays: [],
    relearnCount: 0,
    exposureCount: 0,
    lapses: 0,
    fsrs: createEmptyCard(new Date(now)),
    atRisk: false,
  };
}

const demote = (state: CardState): CardState => {
  const i = CARD_STATE_ORDER.indexOf(state);
  return CARD_STATE_ORDER[Math.max(1, i - 1)]; // never demotes below "learning"
};

/**
 * Apply one recall result to the criterion state machine. Pure — returns a
 * new progress; FSRS scheduling is applied separately (see fsrs.ts) so this
 * machine stays independently testable.
 */
export function advanceState(progress: CardProgress, correct: boolean, now: number): CardProgress {
  const next: CardProgress = {
    ...progress,
    correctDays: [...progress.correctDays],
    exposureCount: progress.exposureCount + 1,
  };
  const today = isoDay(now);

  if (!correct) {
    // Drop back one state, reset the within-state streak, count the lapse.
    next.lapses += 1;
    next.state = progress.state === "new" ? "learning" : demote(progress.state);
    next.correctDays = [];
    if (progress.state === "durable" || progress.state === "maintenance") {
      // Relearn progress resets on lapse out of the relearn phase.
      next.relearnCount = 0;
    }
    return next;
  }

  switch (progress.state) {
    case "new":
      next.state = "learning";
      next.correctDays = [today];
      return next;

    case "learning": {
      if (!next.correctDays.includes(today)) next.correctDays.push(today);
      if (next.correctDays.length >= CRITERION_CORRECT_DAYS) {
        next.state = "criterion";
        next.correctDays = [];
        next.relearnCount = 0;
      }
      return next;
    }

    case "criterion":
      // First successful relearn after hitting criterion → Maintenance.
      next.relearnCount = 1;
      next.state = "maintenance";
      return next;

    case "maintenance": {
      next.relearnCount = progress.relearnCount + 1;
      if (next.relearnCount >= DURABLE_RELEARNS) next.state = "durable";
      return next;
    }

    case "durable":
      // Stays durable; continued correct reviews just extend FSRS intervals.
      return next;
  }
}

/**
 * Minimum calendar days a card needs to reach Durable from its current
 * state, assuming a correct recall every day it is due. Used for the
 * Amendment A1 atRisk computation.
 */
export function minDaysToDurable(progress: CardProgress): number {
  switch (progress.state) {
    case "new":
      return CRITERION_CORRECT_DAYS + DURABLE_RELEARNS;
    case "learning":
      return CRITERION_CORRECT_DAYS - progress.correctDays.length + DURABLE_RELEARNS;
    case "criterion":
      return DURABLE_RELEARNS;
    case "maintenance":
      return DURABLE_RELEARNS - progress.relearnCount;
    case "durable":
      return 0;
  }
}
