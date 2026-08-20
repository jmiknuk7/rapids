import { describe, expect, it } from "vitest";
import {
  createSession,
  reduceSession,
  isArmed,
  medianMsPerCard,
  sessionCounters,
  REVEAL_ARM_MS,
  type FeedSession,
  type FeedAction,
} from "../lib/learning/session";

/**
 * Behavioral proof for the Feed session machine (A11 review: pixel-identical
 * is not behavior-identical — shownAt gates arming and feeds median
 * time-per-card, so its semantics are asserted here, not implied).
 */

const T0 = 1_000_000;
const run = (s: FeedSession, ...as: FeedAction[]) => as.reduce(reduceSession, s);

describe("shownAt semantics", () => {
  it("stamps when a slot becomes active — not on mount, not on later renders", () => {
    const s = createSession(T0);
    expect(s.shownAt).toEqual({ 0: T0 }); // init activates slot 0 only
    expect(s.shownAt[1]).toBeUndefined(); // rendered-but-inactive slots unstamped
    const s2 = run(s, { type: "activate", idx: 1, at: T0 + 5000 });
    expect(s2.shownAt[1]).toBe(T0 + 5000);
  });

  it("stamps exactly once — revisiting a slot does not restamp", () => {
    let s = createSession(T0);
    s = run(
      s,
      { type: "activate", idx: 1, at: T0 + 1000 },
      { type: "activate", idx: 0, at: T0 + 9000 }, // scroll back
      { type: "activate", idx: 1, at: T0 + 15000 }, // revisit
    );
    expect(s.shownAt[0]).toBe(T0);
    expect(s.shownAt[1]).toBe(T0 + 1000);
  });

  it("attempting or revealing does not stamp or restamp", () => {
    let s = createSession(T0);
    s = run(s, { type: "attempt", idx: 0, at: T0 + 3000 });
    s = run(s, { type: "confidence", idx: 0, confidence: "confident" });
    expect(s.shownAt[0]).toBe(T0);
  });
});

describe("2-second reveal arming", () => {
  it("is inert for exactly REVEAL_ARM_MS from shownAt and arms after", () => {
    const s = createSession(T0);
    expect(isArmed(s, 0, T0)).toBe(false);
    expect(isArmed(s, 0, T0 + REVEAL_ARM_MS - 1)).toBe(false);
    expect(isArmed(s, 0, T0 + REVEAL_ARM_MS)).toBe(true);
  });

  it("arms from first-shown, not from revisit", () => {
    let s = createSession(T0);
    s = run(
      s,
      { type: "activate", idx: 1, at: T0 + 100 },
      { type: "activate", idx: 0, at: T0 + 200 }, // back to 0 instantly
    );
    // Slot 0 was first shown at T0 — long armed by now regardless of revisit.
    expect(isArmed(s, 0, T0 + REVEAL_ARM_MS + 300)).toBe(true);
    // Slot 1 arms 2s after ITS first showing.
    expect(isArmed(s, 1, T0 + 100 + REVEAL_ARM_MS - 1)).toBe(false);
    expect(isArmed(s, 1, T0 + 100 + REVEAL_ARM_MS)).toBe(true);
  });
});

describe("skip-lapse and read-only-after-skip (finding 4 rule)", () => {
  it("scrolling past a shown, ungraded card records exactly one lapse with confidence null", () => {
    let s = createSession(T0);
    s = run(s, { type: "activate", idx: 1, at: T0 + 4000 });
    expect(s.records).toHaveLength(1);
    expect(s.records[0]).toMatchObject({
      idx: 0,
      grade: "again",
      confidence: null,
      correct: false,
      skipped: true,
      durationMs: null,
    });
    expect(s.slots[0].skipped).toBe(true);
  });

  it("skipping then answering produces exactly one review record, of type lapse, confidence null", () => {
    let s = createSession(T0);
    s = run(
      s,
      { type: "activate", idx: 1, at: T0 + 4000 }, // skip slot 0
      { type: "activate", idx: 0, at: T0 + 8000 }, // come back
      { type: "attempt", idx: 0, at: T0 + 11000 }, // grading path must be closed
      { type: "confidence", idx: 0, confidence: "certain" },
      { type: "grade", idx: 0, grade: "good", correct: true, at: T0 + 12000 },
    );
    expect(s.records).toHaveLength(1);
    expect(s.records[0]).toMatchObject({ skipped: true, confidence: null, grade: "again" });
    expect(s.slots[0].graded).toBeUndefined();
  });

  it("a skipped card can still be revealed for learning, without any record", () => {
    let s = createSession(T0);
    s = run(
      s,
      { type: "activate", idx: 1, at: T0 + 4000 },
      { type: "activate", idx: 0, at: T0 + 8000 },
      { type: "reveal-skipped", idx: 0 },
    );
    expect(s.slots[0].revealed).toBe(true);
    expect(s.records).toHaveLength(1); // still just the lapse
  });

  it("scrolling past never-shown slots records nothing (a jump is not 12 lapses)", () => {
    let s = createSession(T0);
    s = run(s, { type: "activate", idx: 12, at: T0 + 3000 }); // direct jump
    expect(s.records).toHaveLength(1); // only slot 0 was ever shown
    expect(s.records[0].idx).toBe(0);
  });

  it("a skip is recorded once even across repeated back-and-forth scrolling", () => {
    let s = createSession(T0);
    s = run(
      s,
      { type: "activate", idx: 1, at: T0 + 4000 },
      { type: "activate", idx: 0, at: T0 + 5000 },
      { type: "activate", idx: 1, at: T0 + 6000 },
      { type: "activate", idx: 0, at: T0 + 7000 },
      { type: "activate", idx: 1, at: T0 + 8000 },
    );
    expect(s.records.filter((r) => r.idx === 0)).toHaveLength(1);
  });
});

describe("median time-per-card", () => {
  it("computes over graded durations only, across a synthetic session with a skip and a revisit", () => {
    let s = createSession(T0);
    // Card 0: graded 3s after first shown.
    s = run(
      s,
      { type: "attempt", idx: 0, at: T0 + 2100 },
      { type: "confidence", idx: 0, confidence: "confident" },
      { type: "grade", idx: 0, grade: "good", correct: true, at: T0 + 3000 },
    );
    // Card 1: shown, scrolled past (skip), no duration sample.
    s = run(s, { type: "activate", idx: 1, at: T0 + 3100 });
    s = run(s, { type: "activate", idx: 2, at: T0 + 10000 });
    // Card 2: shown at 10s, scrolled away and back, graded at 21s → 11s from FIRST shown.
    s = run(
      s,
      { type: "activate", idx: 1, at: T0 + 12000 }, // away (slot 1 already skip-recorded)
      { type: "activate", idx: 2, at: T0 + 15000 }, // back — no restamp
      { type: "attempt", idx: 2, at: T0 + 18000 },
      { type: "confidence", idx: 2, confidence: "unsure" },
      { type: "grade", idx: 2, grade: "hard", correct: true, at: T0 + 21000 },
    );
    const durations = s.records.filter((r) => !r.skipped).map((r) => r.durationMs);
    expect(durations).toEqual([3000, 11000]); // revisit did NOT restart the clock
    expect(medianMsPerCard(s)).toBe(7000); // median of [3000, 11000]
    expect(s.records.filter((r) => r.skipped)).toHaveLength(1); // the skip carries no sample
  });
});

describe("progress mirror: counters derive from the record log", () => {
  it("reflects queue position and counts after scroll, after skip, and after a grade", () => {
    let s = createSession(T0);
    expect(s.activeIdx).toBe(0);
    s = run(
      s,
      { type: "attempt", idx: 0, at: T0 + 2100 },
      { type: "confidence", idx: 0, confidence: "certain" },
      { type: "grade", idx: 0, grade: "easy", correct: true, at: T0 + 3000 },
      { type: "activate", idx: 1, at: T0 + 3500 }, // scroll
      { type: "activate", idx: 2, at: T0 + 9000 }, // skips slot 1
    );
    expect(s.activeIdx).toBe(2);
    const c = sessionCounters(s);
    expect(c).toEqual({ answered: 2, correct: 1, lapses: 1, skipped: 1, streak: 0 });
    // Grade another correct: streak restarts from the lapse.
    s = run(
      s,
      { type: "attempt", idx: 2, at: T0 + 11500 },
      { type: "confidence", idx: 2, confidence: "confident" },
      { type: "grade", idx: 2, grade: "good", correct: true, at: T0 + 12000 },
    );
    expect(sessionCounters(s)).toEqual({ answered: 3, correct: 2, lapses: 1, skipped: 1, streak: 1 });
  });
});
