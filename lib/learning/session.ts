import type { Confidence, ReviewGrade } from "./types";

/**
 * Pure session-state machine for the Feed. The Feed component dispatches
 * actions and renders this state; it does not own behavior. Extracted after
 * the A11 review ruled that pixel-identical is not behavior-identical:
 * shownAt gates the 2-second reveal arming and feeds median time-per-card —
 * the instrument measuring the interaction most likely to make the app
 * unused — so its semantics are unit-tested here, not implied by React
 * wiring.
 *
 * Behavioral contract (each clause unit-tested):
 * - shownAt stamps when a slot BECOMES ACTIVE (activate action from
 *   scroll/init), exactly once — never on mount, render, or flip.
 * - The reveal attempt is inert until exactly REVEAL_ARM_MS after shownAt.
 * - Scrolling forward past a shown-but-ungraded slot records a skip-lapse:
 *   exactly one review record, grade "again", confidence null, skipped true.
 * - After a skip-lapse the card is READ-ONLY FOR GRADING (A11 review,
 *   finding 4): the answer may be revealed for learning, but no confidence,
 *   no grade, and no second review record are ever accepted.
 * - Card duration = gradedAt − firstShownAt (revisits after scroll-away do
 *   NOT restart the clock; the metric measures time-to-resolution from
 *   first exposure). Skips contribute a lapse but no duration sample.
 * - Median time-per-card = median over graded durations only.
 */

export const REVEAL_ARM_MS = 2000;

export interface SlotUiState {
  attempted?: { mcPick?: number; at: number };
  confidence?: Confidence;
  revealed?: boolean;
  graded?: boolean;
  correct?: boolean;
  skipped?: boolean;
  durationMs?: number;
}

export interface ReviewRecord {
  idx: number;
  grade: ReviewGrade;
  confidence: Confidence | null;
  correct: boolean;
  skipped: boolean;
  at: number;
  durationMs: number | null;
}

export interface FeedSession {
  activeIdx: number;
  shownAt: Record<number, number>;
  slots: Record<number, SlotUiState>;
  records: ReviewRecord[];
}

export type FeedAction =
  | { type: "activate"; idx: number; at: number }
  | { type: "attempt"; idx: number; at: number; mcPick?: number }
  | { type: "confidence"; idx: number; confidence: Confidence }
  | { type: "grade"; idx: number; grade: ReviewGrade; correct: boolean; at: number }
  | { type: "reveal-skipped"; idx: number };

export function createSession(now: number): FeedSession {
  return { activeIdx: 0, shownAt: { 0: now }, slots: {}, records: [] };
}

const slot = (s: FeedSession, idx: number): SlotUiState => s.slots[idx] ?? {};

const withSlot = (s: FeedSession, idx: number, patch: Partial<SlotUiState>): FeedSession => ({
  ...s,
  slots: { ...s.slots, [idx]: { ...slot(s, idx), ...patch } },
});

export function reduceSession(s: FeedSession, a: FeedAction): FeedSession {
  switch (a.type) {
    case "activate": {
      let next = s;
      // Scrolling forward past a shown slot records a skip-lapse ONLY when
      // the card was never attempted — the spec is "skipping a card WITHOUT
      // ATTEMPTING counts as a lapse". An attempted card keeps its state
      // (confidence, reveal) and can be graded on return; C7 of the device
      // pass caught the over-application. Exactly-once is state-guarded.
      if (a.idx > s.activeIdx) {
        for (let i = s.activeIdx; i < a.idx; i++) {
          const st = slot(next, i);
          if (next.shownAt[i] && !st.graded && !st.skipped && !st.attempted) {
            next = withSlot(next, i, { skipped: true });
            next = {
              ...next,
              records: [
                ...next.records,
                {
                  idx: i,
                  grade: "again",
                  confidence: null, // never fabricated on a skip
                  correct: false,
                  skipped: true,
                  at: a.at,
                  durationMs: null,
                },
              ],
            };
          }
        }
      }
      // shownAt stamps on BECOMING ACTIVE, once — revisits do not restamp.
      const shownAt = next.shownAt[a.idx] ? next.shownAt : { ...next.shownAt, [a.idx]: a.at };
      return { ...next, activeIdx: a.idx, shownAt };
    }

    case "attempt": {
      const st = slot(s, a.idx);
      if (st.attempted || st.graded || st.skipped) return s; // skipped: grading path closed
      return withSlot(s, a.idx, { attempted: { mcPick: a.mcPick, at: a.at } });
    }

    case "confidence": {
      const st = slot(s, a.idx);
      if (!st.attempted || st.confidence || st.graded || st.skipped) return s;
      return withSlot(s, a.idx, { confidence: a.confidence, revealed: true });
    }

    case "grade": {
      const st = slot(s, a.idx);
      if (!st.revealed || st.graded || st.skipped) return s; // one record per card, ever
      const shownAt = s.shownAt[a.idx];
      const durationMs = shownAt ? a.at - shownAt : null;
      const next = withSlot(s, a.idx, { graded: true, correct: a.correct, durationMs: durationMs ?? undefined });
      return {
        ...next,
        records: [
          ...next.records,
          {
            idx: a.idx,
            grade: a.grade,
            confidence: st.confidence ?? null,
            correct: a.correct,
            skipped: false,
            at: a.at,
            durationMs,
          },
        ],
      };
    }

    case "reveal-skipped": {
      const st = slot(s, a.idx);
      if (!st.skipped || st.graded) return s;
      return withSlot(s, a.idx, { revealed: true }); // learning allowed; grading stays closed
    }
  }
}

/** The reveal attempt arms exactly REVEAL_ARM_MS after first shown. */
export function isArmed(s: FeedSession, idx: number, now: number): boolean {
  const shownAt = s.shownAt[idx];
  return !!shownAt && now - shownAt >= REVEAL_ARM_MS;
}

export function medianMsPerCard(s: FeedSession): number | null {
  const xs = s.records
    .filter((r) => !r.skipped && r.durationMs !== null)
    .map((r) => r.durationMs as number);
  if (!xs.length) return null;
  const sorted = [...xs].sort((a, b) => a - b);
  const m = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[m] : (sorted[m - 1] + sorted[m]) / 2;
}

export interface SessionCounters {
  answered: number;
  correct: number;
  lapses: number;
  skipped: number;
  streak: number;
}

/** Counters derived from the record log — no shadow counting to drift. */
export function sessionCounters(s: FeedSession): SessionCounters {
  let streak = 0;
  for (let i = s.records.length - 1; i >= 0; i--) {
    if (s.records[i].correct) streak++;
    else break;
  }
  return {
    answered: s.records.length,
    correct: s.records.filter((r) => r.correct).length,
    lapses: s.records.filter((r) => !r.correct).length,
    skipped: s.records.filter((r) => r.skipped).length,
    streak,
  };
}
