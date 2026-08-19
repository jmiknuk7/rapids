import type { Card as FsrsCard } from "ts-fsrs";

/**
 * Core types for the Rapids learning engine. Everything in lib/learning is
 * a pure function over these types — no React, no IndexedDB, no Date.now()
 * inside logic (callers pass `now`). Persistence lives elsewhere.
 */

/** FSRS's four grades. Never a binary — the Feed's action bar maps to these. */
export type ReviewGrade = "again" | "hard" | "good" | "easy";

/**
 * Stated confidence, tapped BEFORE the reveal. Logged alongside correctness;
 * only ever ADDS scheduling priority, never reduces it.
 */
export type Confidence = "guess" | "unsure" | "confident" | "certain";

/**
 * Successive-relearning states (Rawson, Dunlosky & Sciartelli 2013):
 * a card reaches Criterion only after 3 correct recalls on 3 separate
 * calendar days; it is Durable only after 3 further correct relearns at
 * FSRS-scheduled expanding intervals. Any incorrect recall drops the card
 * back one state and resets its within-state streak.
 */
export type CardState = "new" | "learning" | "criterion" | "maintenance" | "durable";

export const CARD_STATE_ORDER: CardState[] = [
  "new",
  "learning",
  "criterion",
  "maintenance",
  "durable",
];

export interface CardProgress {
  cardId: string;
  examId: string;
  /** null = cross-domain card (general pool). */
  domainId: string | null;
  state: CardState;
  /**
   * ISO dates (YYYY-MM-DD) of correct recalls counting toward the current
   * state's criterion. Only one entry per calendar day — two correct recalls
   * on the same day count once (the "3 separate days" requirement).
   */
  correctDays: string[];
  /** Correct relearns completed since reaching Criterion (Durable at 3). */
  relearnCount: number;
  /** Total times this card has been shown (Amendment A7 exposure tracking). */
  exposureCount: number;
  /** Total incorrect recalls, ever. */
  lapses: number;
  /** FSRS memory state (stability, difficulty, due, ...). */
  fsrs: FsrsCard;
  /**
   * True when the card cannot reach Criterion/Durable before the exam date
   * at the current daily volume (Amendment A1). Surfaced, never dropped.
   */
  atRisk: boolean;
}

export interface ReviewEvent {
  cardId: string;
  examId: string;
  domainId: string | null;
  /** Epoch ms of the review. */
  at: number;
  grade: ReviewGrade;
  /**
   * null on a skip-lapse: the user never stated a confidence, and logging
   * one would fabricate calibration data. Calibration only consumes events
   * with a real stated confidence.
   */
  confidence: Confidence | null;
  correct: boolean;
  /** True when the lapse came from scrolling past without attempting. */
  skipped?: boolean;
}

/** A review of an MC question (exposure + calibration tracking). */
export interface QuestionEvent {
  questionId: string;
  examId: string;
  domainId: string;
  at: number;
  confidence: Confidence;
  correct: boolean;
}

export const isCorrectGrade = (g: ReviewGrade): boolean => g !== "again";

/** ISO calendar date (YYYY-MM-DD) in UTC for an epoch-ms timestamp. */
export const isoDay = (epochMs: number): string => new Date(epochMs).toISOString().slice(0, 10);

export const DAY_MS = 86_400_000;
