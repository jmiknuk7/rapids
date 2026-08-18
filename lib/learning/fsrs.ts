import { fsrs, generatorParameters, Rating, type Card as FsrsCard } from "ts-fsrs";
import type { ReviewGrade } from "./types";
import { DAY_MS } from "./types";

/**
 * Thin wrapper over ts-fsrs. FSRS is fit to a public benchmark of 700M+
 * real Anki reviews and predicts recall more accurately than SM-2 for 99.5%
 * of benchmarked users; simulation indicates 20–30% fewer reviews for
 * equivalent retention. Honest caveat (rendered on /method): the efficiency
 * figure comes from simulation, not a controlled trial with students.
 * Sources: github.com/open-spaced-repetition/srs-benchmark,
 * github.com/open-spaced-repetition/ts-fsrs.
 */

const RATING: Record<ReviewGrade, Rating> = {
  again: Rating.Again,
  hard: Rating.Hard,
  good: Rating.Good,
  easy: Rating.Easy,
};

export interface Scheduler {
  /** Apply a graded review; returns the updated FSRS card and the raw interval in days. */
  review(card: FsrsCard, grade: ReviewGrade, now: number): { card: FsrsCard; intervalDays: number };
  /** Predicted probability of recall at `now` (0..1). */
  retrievability(card: FsrsCard, now: number): number;
}

export function makeScheduler(retentionTarget = 0.9): Scheduler {
  const f = fsrs(generatorParameters({ request_retention: retentionTarget }));
  return {
    review(card, grade, now) {
      const { card: next } = f.next(card, new Date(now), RATING[grade]);
      const intervalDays = Math.max(0, (next.due.getTime() - now) / DAY_MS);
      return { card: next, intervalDays };
    },
    retrievability(card, now) {
      return f.get_retrievability(card, new Date(now), false);
    },
  };
}
