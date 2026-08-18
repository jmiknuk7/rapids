import { describe, expect, it } from "vitest";
import {
  advanceState,
  initialProgress,
  minDaysToDurable,
  CARD_STATE_ORDER,
  DAY_MS,
  type CardProgress,
} from "../lib/learning";
import { mulberry32 } from "../lib/learning/rng";

const T0 = Date.parse("2026-09-01T12:00:00Z");
const day = (n: number) => T0 + n * DAY_MS;
const fresh = () => initialProgress("c1", "cca-f", "d1", T0);

const correctOn = (p: CardProgress, n: number) => advanceState(p, true, day(n));
const wrongOn = (p: CardProgress, n: number) => advanceState(p, false, day(n));

describe("criterion state machine (successive relearning)", () => {
  it("New → Learning on first correct recall", () => {
    const p = correctOn(fresh(), 0);
    expect(p.state).toBe("learning");
    expect(p.correctDays).toEqual(["2026-09-01"]);
  });

  it("three correct recalls on the SAME day do not reach Criterion", () => {
    let p = fresh();
    p = correctOn(p, 0);
    p = advanceState(p, true, day(0) + 1000);
    p = advanceState(p, true, day(0) + 2000);
    expect(p.state).toBe("learning");
    expect(p.correctDays).toHaveLength(1);
  });

  it("three correct recalls on three SEPARATE days reach Criterion", () => {
    let p = fresh();
    p = correctOn(p, 0);
    p = correctOn(p, 1);
    expect(p.state).toBe("learning");
    p = correctOn(p, 3);
    expect(p.state).toBe("criterion");
    expect(p.relearnCount).toBe(0);
  });

  it("Criterion → Maintenance on first relearn, Durable after 3 relearns", () => {
    let p = fresh();
    for (const n of [0, 1, 2]) p = correctOn(p, n);
    expect(p.state).toBe("criterion");
    p = correctOn(p, 7);
    expect(p.state).toBe("maintenance");
    expect(p.relearnCount).toBe(1);
    p = correctOn(p, 14);
    expect(p.state).toBe("maintenance");
    p = correctOn(p, 28);
    expect(p.state).toBe("durable");
    expect(p.relearnCount).toBe(3);
  });

  it("an incorrect recall drops exactly one state and resets the streak", () => {
    let p = fresh();
    for (const n of [0, 1, 2, 7, 14, 28]) p = correctOn(p, n); // durable
    expect(p.state).toBe("durable");
    p = wrongOn(p, 35);
    expect(p.state).toBe("maintenance");
    expect(p.relearnCount).toBe(0); // within-state streak reset
    p = wrongOn(p, 36);
    expect(p.state).toBe("criterion");
    p = wrongOn(p, 37);
    expect(p.state).toBe("learning");
    expect(p.correctDays).toEqual([]);
    p = wrongOn(p, 38);
    expect(p.state).toBe("learning"); // floor — never demotes below learning
    expect(p.lapses).toBe(4);
  });

  it("a lapse in Learning resets the separate-days progress", () => {
    let p = fresh();
    p = correctOn(p, 0);
    p = correctOn(p, 1);
    p = wrongOn(p, 2);
    expect(p.state).toBe("learning");
    expect(p.correctDays).toEqual([]);
    p = correctOn(p, 3);
    p = correctOn(p, 4);
    expect(p.state).toBe("learning"); // needs a full fresh 3 days
    p = correctOn(p, 5);
    expect(p.state).toBe("criterion");
  });

  it("minDaysToDurable is monotone along the state order", () => {
    let p = fresh();
    const seq = [minDaysToDurable(p)];
    for (const n of [0, 1, 2, 7, 14, 28]) {
      p = correctOn(p, n);
      seq.push(minDaysToDurable(p));
    }
    expect(seq).toEqual([6, 5, 4, 3, 2, 1, 0]);
  });
});

describe("simulation: 500 synthetic reviews never skip a state or reach Durable early", () => {
  it("holds all invariants across 500 randomized reviews on 25 cards", () => {
    const rng = mulberry32(0xc0ffee);
    const cards = new Map<string, CardProgress>();
    // Shadow bookkeeping, independent of the implementation under test:
    const shadowDays = new Map<string, Set<string>>(); // distinct correct days while in learning
    const shadowRelearns = new Map<string, number>(); // correct relearns since criterion

    for (let i = 0; i < 25; i++) {
      const id = `card-${i}`;
      cards.set(id, initialProgress(id, "cca-f", `d${(i % 5) + 1}`, T0));
      shadowDays.set(id, new Set());
      shadowRelearns.set(id, 0);
    }

    let transitions = 0;
    let reachedDurable = 0;
    for (let step = 0; step < 500; step++) {
      const id = `card-${Math.floor(rng() * 25)}`;
      const before = cards.get(id)!;
      const now = day(Math.floor(step / 12)) + Math.floor(rng() * DAY_MS * 0.4);
      const correct = rng() < 0.75;
      const after = advanceState(before, correct, now);
      cards.set(id, after);

      const iBefore = CARD_STATE_ORDER.indexOf(before.state);
      const iAfter = CARD_STATE_ORDER.indexOf(after.state);

      // Invariant 1: never skip a state in either direction.
      expect(Math.abs(iAfter - iBefore), `step ${step}: ${before.state}→${after.state}`).toBeLessThanOrEqual(1);
      // Invariant 2: never demote below learning; the only "promotion" a
      // lapse can produce is new→learning (the first attempt leaves "new"
      // regardless of its result).
      if (!correct) expect(iAfter).toBeLessThanOrEqual(Math.max(1, iBefore));
      if (iAfter > iBefore && before.state !== "new") expect(correct).toBe(true);

      // Shadow bookkeeping (implementation-independent).
      const today = new Date(now).toISOString().slice(0, 10);
      if (correct && before.state === "learning") shadowDays.get(id)!.add(today);
      if (correct && before.state === "new") shadowDays.set(id, new Set([today]));
      if (!correct) shadowDays.set(id, new Set());
      if (correct && (before.state === "criterion" || before.state === "maintenance"))
        shadowRelearns.set(id, shadowRelearns.get(id)! + 1);
      if (!correct || (before.state === "learning" && after.state === "criterion"))
        if (!correct) shadowRelearns.set(id, 0);

      // Invariant 3: Criterion requires 3 distinct correct days (shadow-checked).
      if (before.state === "learning" && after.state === "criterion") {
        expect(shadowDays.get(id)!.size, `step ${step}: early criterion`).toBeGreaterThanOrEqual(3);
        shadowDays.set(id, new Set());
        shadowRelearns.set(id, 0);
      }
      // Invariant 4: Durable requires 3 correct relearns since Criterion.
      if (before.state !== "durable" && after.state === "durable") {
        expect(shadowRelearns.get(id)!, `step ${step}: early durable`).toBeGreaterThanOrEqual(3);
        reachedDurable++;
      }
      // Invariant 5: exposure always increments; lapses only on incorrect.
      expect(after.exposureCount).toBe(before.exposureCount + 1);
      expect(after.lapses).toBe(before.lapses + (correct ? 0 : 1));

      if (iAfter !== iBefore) transitions++;
    }

    // Composition, not a bare count: the run must actually exercise the machine.
    expect(transitions).toBeGreaterThan(50);
    expect(reachedDurable).toBeGreaterThan(0);
  });
});
