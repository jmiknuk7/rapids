import { describe, expect, it } from "vitest";
import {
  clampInterval,
  consolidationStart,
  computeAtRisk,
  daysToExam,
  inConsolidation,
  initialProgress,
  advanceState,
  makeScheduler,
  DAY_MS,
} from "../lib/learning";

const NOW = Date.parse("2026-09-01T08:00:00Z");
const iso = (epoch: number) => new Date(epoch).toISOString().slice(0, 10);

describe("deadline-aware scheduling (Amendment A1)", () => {
  it("no scheduled interval ever exceeds daysToExam (grid property)", () => {
    for (let dte = 1; dte <= 120; dte++) {
      const examDate = iso(NOW + dte * DAY_MS + DAY_MS / 2);
      for (const fsrsInterval of [0.007, 0.5, 1, 3, 7, 30, 90, 365]) {
        const clamped = clampInterval(fsrsInterval, NOW, examDate);
        expect(clamped, `dte=${dte} fsrs=${fsrsInterval}`).toBeLessThanOrEqual(
          daysToExam(NOW, examDate),
        );
        // Hard clamp: due date lands no later than examDate − 1.
        expect(clamped).toBeLessThanOrEqual(Math.max(0, daysToExam(NOW, examDate) - 1));
      }
    }
  });

  it("null exam date passes FSRS intervals through unchanged (dashboard prompts instead)", () => {
    expect(clampInterval(42, NOW, null)).toBe(42);
  });

  it("inside ~6 weeks the gap targets 20% of the window, never below 1 day from the rule", () => {
    const examDate = iso(NOW + 30 * DAY_MS + DAY_MS / 2);
    const dte = daysToExam(NOW, examDate); // 29: iso() truncates to the date's midnight
    expect(clampInterval(90, NOW, examDate)).toBeCloseTo(0.2 * dte, 5);
    const near = iso(NOW + 3 * DAY_MS + DAY_MS / 2); // dte = 2 → 0.2·2 = 0.4 → floor 1
    expect(clampInterval(90, NOW, near)).toBe(1);
  });

  it("FSRS sub-day learning steps pass through (the 1-day floor constrains the rule, not FSRS)", () => {
    const examDate = iso(NOW + 30 * DAY_MS + DAY_MS / 2);
    expect(clampInterval(0.007, NOW, examDate)).toBeCloseTo(0.007, 6);
  });

  it("outside the 6-week window only the hard clamp applies", () => {
    const examDate = iso(NOW + 100 * DAY_MS + DAY_MS / 2);
    const dte = daysToExam(NOW, examDate); // 99
    expect(clampInterval(21, NOW, examDate)).toBe(21); // 20% rule inactive far out
    expect(clampInterval(365, NOW, examDate)).toBe(dte - 1); // hard clamp to examDate − 1
  });

  it("on exam eve the interval floors to same-day, not past the exam", () => {
    const examDate = iso(NOW + 1 * DAY_MS + DAY_MS / 2); // dte = 1
    expect(clampInterval(7, NOW, examDate)).toBe(0);
  });

  it("consolidation mode triggers on the exact 80% boundary date", () => {
    // Window: set 2026-09-01, exam 2026-10-01 (30 days) → start = day 24 = 2026-09-25.
    expect(consolidationStart("2026-09-01", "2026-10-01")).toBe("2026-09-25");
    expect(inConsolidation(Date.parse("2026-09-24T23:59:59Z"), "2026-09-01", "2026-10-01")).toBe(false);
    expect(inConsolidation(Date.parse("2026-09-25T00:00:00Z"), "2026-09-01", "2026-10-01")).toBe(true);
    expect(inConsolidation(Date.parse("2026-09-30T23:00:00Z"), "2026-09-01", "2026-10-01")).toBe(true);
    expect(inConsolidation(Date.parse("2026-10-01T01:00:00Z"), "2026-09-01", "2026-10-01")).toBe(false);
  });

  it("marks cards atRisk on timeline (cannot reach Criterion in remaining days)", () => {
    const p = initialProgress("slow", "cca-f", "d1", NOW); // needs 3 separate days
    const examDate = iso(NOW + 2 * DAY_MS + DAY_MS / 2); // dte = 2
    const { atRiskIds } = computeAtRisk([p], NOW, examDate, 100);
    expect(atRiskIds.has("slow")).toBe(true);
  });

  it("marks overflow cards atRisk on volume, closest-to-done first get slots", () => {
    const nearlyDone = ["a", "b"].map((id) => {
      let p = initialProgress(id, "cca-f", "d1", NOW);
      for (const n of [0, 1, 2, 7, 14]) p = advanceState(p, true, NOW + n * DAY_MS); // maintenance, 1 relearn left
      return p;
    });
    const fresh = ["c", "d", "e"].map((id) => initialProgress(id, "cca-f", "d1", NOW));
    const examDate = iso(NOW + 4 * DAY_MS + DAY_MS / 2); // dte = 4
    // capacity = 1/day × 4 days = 4 slots; nearlyDone need 1 each, fresh need 6 each.
    const { atRiskIds } = computeAtRisk([...nearlyDone, ...fresh], NOW, examDate, 1);
    expect(atRiskIds.has("a")).toBe(false);
    expect(atRiskIds.has("b")).toBe(false);
    for (const id of ["c", "d", "e"]) expect(atRiskIds.has(id)).toBe(true);
  });

  it("integrates with real FSRS output: clamped reviews stay inside the window", () => {
    const sched = makeScheduler(0.9);
    const examDate = iso(NOW + 14 * DAY_MS + DAY_MS / 2);
    let p = initialProgress("x", "cca-f", "d1", NOW);
    let t = NOW;
    for (let i = 0; i < 10; i++) {
      const { card, intervalDays } = sched.review(p.fsrs, "good", t);
      const clamped = clampInterval(intervalDays, t, examDate);
      expect(clamped).toBeLessThanOrEqual(Math.max(0, daysToExam(t, examDate)));
      p = { ...advanceState(p, true, t), fsrs: card };
      t += Math.max(clamped * DAY_MS, 60_000);
      if (daysToExam(t, examDate) <= 0) break;
    }
  });
});
