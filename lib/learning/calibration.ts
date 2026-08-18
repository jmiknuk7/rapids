import type { Confidence } from "./types";

/**
 * Confidence calibration. After every answer, BEFORE the reveal, the user
 * taps Guess / Unsure / Confident / Certain. Confidence is logged alongside
 * correctness. It only ever ADDS queue priority — never reduces scheduling.
 *
 * Citations (rendered on /method): metacognitive calibration correlates
 * with exam performance — Frontiers in Psychology 2026,
 * 10.3389/fpsyg.2026.1720303 (r = 0.467 for metacognitive cognition,
 * p < 0.01); Tobias & Everson on knowledge monitoring.
 */

/**
 * Fixed numeric reading of each stated confidence level (the scale midpoint
 * each label implies). Used only to compute the calibration gap — never to
 * reduce scheduling.
 */
export const CONFIDENCE_VALUE: Record<Confidence, number> = {
  guess: 0.25,
  unsure: 0.5,
  confident: 0.75,
  certain: 0.95,
};

export interface ScoredAttempt {
  domainId: string | null;
  confidence: Confidence;
  correct: boolean;
}

export interface CalibrationReport {
  /** mean(stated confidence) − actual accuracy. Positive = overconfident. */
  gap: number;
  attempts: number;
  statedMean: number;
  accuracy: number;
}

export function calibration(attempts: ScoredAttempt[]): CalibrationReport {
  if (attempts.length === 0) return { gap: 0, attempts: 0, statedMean: 0, accuracy: 0 };
  const statedMean =
    attempts.reduce((a, x) => a + CONFIDENCE_VALUE[x.confidence], 0) / attempts.length;
  const accuracy = attempts.filter((x) => x.correct).length / attempts.length;
  return { gap: statedMean - accuracy, attempts: attempts.length, statedMean, accuracy };
}

export function calibrationByDomain(attempts: ScoredAttempt[]): Record<string, CalibrationReport> {
  const groups: Record<string, ScoredAttempt[]> = {};
  for (const a of attempts) {
    const k = a.domainId ?? "cross";
    (groups[k] ??= []).push(a);
  }
  return Object.fromEntries(Object.entries(groups).map(([k, v]) => [k, calibration(v)]));
}

/**
 * Certain + Wrong: the blind spot. These get the highest possible queue
 * priority and a dedicated view — the cards that fail people on exam day
 * because they don't study what they don't know they don't know.
 */
export const isBlindSpot = (a: { confidence: Confidence; correct: boolean }): boolean =>
  a.confidence === "certain" && !a.correct;

/**
 * Additive queue-priority boost. Zero for correct answers regardless of
 * confidence (confidence never REDUCES priority); scales with how wrong the
 * stated confidence was. Blind spots get the maximum.
 */
export function priorityBoost(a: { confidence: Confidence; correct: boolean }): number {
  if (a.correct) return 0;
  if (isBlindSpot(a)) return 3;
  return { guess: 0.5, unsure: 1, confident: 2, certain: 3 }[a.confidence];
}
