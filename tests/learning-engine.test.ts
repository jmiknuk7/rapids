import { describe, expect, it } from "vitest";
import {
  makeScheduler,
  calibration,
  calibrationByDomain,
  isBlindSpot,
  priorityBoost,
  interleave,
  coverageByDomain,
  authoringPriority,
  familiarityPenalty,
  medianExposureByDomain,
  computeReadiness,
  initialProgress,
  advanceState,
  DAY_MS,
  type CardProgress,
  type Confidence,
  type ReadinessInput,
} from "../lib/learning";
import { mulberry32 } from "../lib/learning/rng";
import { EXAMS, getExamById } from "../content/registry";

const NOW = Date.parse("2026-09-01T08:00:00Z");

describe("FSRS integration", () => {
  it("intervals expand across successful reviews and retrievability decays", () => {
    const sched = makeScheduler(0.9);
    let card = initialProgress("x", "cca-f", "d1", NOW).fsrs;
    let t = NOW;
    const intervals: number[] = [];
    for (let i = 0; i < 6; i++) {
      const r = sched.review(card, "good", t);
      card = r.card;
      intervals.push(r.intervalDays);
      t = card.due.getTime();
    }
    // Expanding schedule: the last graduated interval far exceeds the first.
    expect(intervals[intervals.length - 1]).toBeGreaterThan(intervals[0]);
    expect(intervals[intervals.length - 1]).toBeGreaterThan(intervals[Math.floor(intervals.length / 2)]);
    // Retrievability decays with elapsed time and stays a probability.
    const rNow = sched.retrievability(card, t);
    const rLater = sched.retrievability(card, t + 30 * DAY_MS);
    expect(rNow).toBeGreaterThan(rLater);
    expect(rLater).toBeGreaterThan(0);
    expect(rNow).toBeLessThanOrEqual(1);
  });

  it("an 'again' produces a shorter next interval than an 'easy'", () => {
    const sched = makeScheduler(0.9);
    const base = initialProgress("x", "cca-f", "d1", NOW).fsrs;
    const again = sched.review(base, "again", NOW).intervalDays;
    const easy = sched.review(base, "easy", NOW).intervalDays;
    expect(again).toBeLessThan(easy);
  });
});

describe("confidence calibration", () => {
  const att = (confidence: Confidence, correct: boolean, domainId = "d1") => ({
    domainId,
    confidence,
    correct,
  });

  it("computes the gap as stated-mean minus accuracy", () => {
    const report = calibration([
      att("certain", false),
      att("certain", true),
      att("guess", true),
      att("unsure", false),
    ]);
    // stated = (0.95+0.95+0.25+0.5)/4 = 0.6625; accuracy = 0.5
    expect(report.statedMean).toBeCloseTo(0.6625, 4);
    expect(report.accuracy).toBe(0.5);
    expect(report.gap).toBeCloseTo(0.1625, 4);
  });

  it("breaks out per domain", () => {
    const by = calibrationByDomain([att("certain", false, "d1"), att("guess", true, "d2")]);
    expect(by.d1.gap).toBeGreaterThan(0);
    expect(by.d2.gap).toBeLessThan(0); // underconfident is a negative gap
  });

  it("certain+wrong is a blind spot with maximum boost; confidence never reduces priority", () => {
    expect(isBlindSpot({ confidence: "certain", correct: false })).toBe(true);
    expect(isBlindSpot({ confidence: "certain", correct: true })).toBe(false);
    expect(priorityBoost({ confidence: "certain", correct: false })).toBe(3);
    for (const c of ["guess", "unsure", "confident", "certain"] as const) {
      expect(priorityBoost({ confidence: c, correct: true })).toBe(0);
      expect(priorityBoost({ confidence: c, correct: false })).toBeGreaterThan(0);
    }
  });
});

describe("blueprint-weighted interleaving", () => {
  const weights = { d1: 27, d2: 18, d3: 20, d4: 20, d5: 15 };
  const bigPools = () => {
    const pools = new Map<string | null, string[]>();
    for (const d of Object.keys(weights)) {
      pools.set(d, Array.from({ length: 2000 }, (_, i) => `${d}-${i}`));
    }
    return pools;
  };

  it("never serves 3 consecutive same-domain items while an alternative pool has stock", () => {
    const queue = interleave({ pools: bigPools(), weights, rng: mulberry32(7) });
    // Walk the queue tracking pool depletion: the cap is only achievable
    // while at least one OTHER domain still has items (the engine serves
    // rather than starves once a single pool remains).
    const stock: Record<string, number> = {};
    for (const q of queue) stock[q.split("-")[0]] = (stock[q.split("-")[0]] ?? 0) + 1;
    let run = 1;
    for (let i = 1; i < queue.length; i++) {
      const d = queue[i].split("-")[0];
      stock[queue[i - 1].split("-")[0]]--;
      run = d === queue[i - 1].split("-")[0] ? run + 1 : 1;
      const alternativesLeft = Object.entries(stock).some(([k, n]) => k !== d && n > 0);
      if (alternativesLeft) expect(run, `position ${i}`).toBeLessThanOrEqual(2);
    }
  });

  it("samples domains proportional to exam weight (±3pp over 5k slots)", () => {
    const queue = interleave({ pools: bigPools(), weights, rng: mulberry32(11) }).slice(0, 5000);
    const share: Record<string, number> = {};
    for (const q of queue) share[q.split("-")[0]] = (share[q.split("-")[0]] ?? 0) + 1;
    for (const [d, w] of Object.entries(weights)) {
      expect(Math.abs(share[d] / 5000 - w / 100), d).toBeLessThan(0.03);
    }
  });

  it("does not suppress a thin-bank domain: d1 keeps its 27% of slots until its pool runs dry (A7)", () => {
    const pools = new Map<string | null, string[]>();
    pools.set("d1", Array.from({ length: 40 }, (_, i) => `d1-${i}`)); // thin
    for (const d of ["d2", "d3", "d4", "d5"])
      pools.set(d, Array.from({ length: 2000 }, (_, i) => `${d}-${i}`));
    const queue = interleave({ pools, weights, rng: mulberry32(3) });
    const first150 = queue.slice(0, 150).filter((q) => q.startsWith("d1-")).length;
    expect(first150 / 150).toBeGreaterThan(0.2); // ~27% requested while stock lasts
  });

  it("serves cross-domain (null) items proportional to their pool share", () => {
    const pools = new Map<string | null, string[]>();
    pools.set("d1", Array.from({ length: 450 }, (_, i) => `d1-${i}`));
    pools.set(null, Array.from({ length: 50 }, (_, i) => `x-${i}`));
    const queue = interleave({ pools, weights: { d1: 100 }, rng: mulberry32(5) });
    expect(queue).toHaveLength(500);
    const crossInFirstHalf = queue.slice(0, 250).filter((q) => q.startsWith("x-")).length;
    expect(crossInFirstHalf).toBeGreaterThan(5); // interspersed, not dumped at the end
  });
});

describe("coverage & authoring priority (Amendment A7)", () => {
  const ccaf = getExamById("cca-f")!;
  const snowpro = getExamById("snowpro-c03")!;

  it("derives CCA-F d1 as the thin bank Jake computed (ratio ≈ 0.57)", () => {
    const cov = Object.fromEntries(coverageByDomain(ccaf).map((c) => [c.domainId, c]));
    expect(cov.d1.questionCount).toBe(18);
    expect(cov.d1.coverageRatio).toBeCloseTo(18 / 116 / 0.27, 2);
    expect(cov.d1.thinBank).toBe(true);
    for (const d of ["d2", "d3", "d4", "d5"]) expect(cov[d].thinBank, d).toBe(false);
  });

  it("SnowPro is in band (worst ratio d1 ≈ 0.85, no thin banks)", () => {
    const cov = coverageByDomain(snowpro);
    for (const c of cov) expect(c.thinBank, c.domainId).toBe(false);
    const d1 = cov.find((c) => c.domainId === "d1")!;
    expect(d1.coverageRatio).toBeCloseTo(35 / 133 / 0.31, 2);
  });

  it("authoring priority puts CCA-F d1 on top by a wide margin", () => {
    const ranked = authoringPriority(ccaf);
    expect(ranked[0].domainId).toBe("d1");
    expect(ranked[0].priority).toBeGreaterThan((ranked[1]?.priority ?? 0) * 2);
  });

  it("familiarity penalty fires only when over-exposed AND thin", () => {
    expect(familiarityPenalty(2, 0.57)).toBe(1); // not over-exposed yet
    expect(familiarityPenalty(5, 0.9)).toBe(1); // bank not thin
    expect(familiarityPenalty(5, 0.57)).toBeCloseTo(0.57 / 0.75, 4);
    expect(familiarityPenalty(10, 0.1)).toBe(0.5); // floored
  });

  it("median exposure is computed per domain from the exposure map", () => {
    const exposure = new Map<string, number>();
    for (const q of ccaf.questions.filter((q) => q.domainId === "d1")) exposure.set(q.id, 4);
    const med = medianExposureByDomain(ccaf, exposure);
    expect(med.d1).toBe(4);
    expect(med.d2).toBe(0);
  });
});

describe("readiness (honest, floored, cappable)", () => {
  const ccaf = getExamById("cca-f")!;

  const settledCard = (id: string, domainId: string): CardProgress => {
    let p = initialProgress(id, "cca-f", domainId, NOW);
    for (const n of [0, 1, 2, 7, 14, 28]) p = advanceState(p, true, NOW + n * DAY_MS);
    return p; // durable
  };

  const baseInput = (): ReadinessInput => {
    const domains = ["d1", "d2", "d3", "d4", "d5"];
    const progress = domains.flatMap((d) =>
      Array.from({ length: 10 }, (_, i) => settledCard(`${d}-c${i}`, d)),
    );
    return {
      exam: ccaf,
      progress,
      attemptsByDomain: Object.fromEntries(domains.map((d) => [d, 50])),
      calibrationByDomain: Object.fromEntries(
        domains.map((d) => [d, { gap: 0, attempts: 50, statedMean: 0.8, accuracy: 0.8 }]),
      ),
      medianExposureByDomain: Object.fromEntries(domains.map((d) => [d, 1])),
      retrievability: () => 0.95,
    };
  };

  it("a domain with fewer than 10 scored attempts shows insufficient data, contributing 0", () => {
    const input = baseInput();
    input.attemptsByDomain.d1 = 9;
    const r = computeReadiness(input);
    const d1 = r.domains.find((d) => d.domainId === "d1")!;
    expect(d1.status).toBe("insufficient-data");
    expect(d1.score).toBe(0);
    expect(r.overall).toBeLessThan(0.75); // 27% of the exam contributes nothing
  });

  it("the uncap gate reads readinessTargetFraction, not the estimated pass fraction (correction 1)", () => {
    const input = baseInput();
    // d5 at 0.75: ABOVE the 0.72 estimated (scaled-derived) fraction but
    // BELOW the 0.80 target margin. A gate on the estimated fraction would
    // uncap here — exactly where "ready" is most likely wrong.
    input.retrievability = (p) => (p.domainId === "d5" ? 0.75 : 1.0);
    const r = computeReadiness(input);
    const d5 = r.domains.find((d) => d.domainId === "d5")!;
    expect(d5.score).toBeGreaterThan(r.estimatedPassFraction);
    expect(d5.score).toBeLessThan(r.readinessTarget);
    expect(r.cappedBelowTarget).toBe(true);
    expect(r.displayPct).toBeLessThan(90);
  });

  it("readinessTargetFraction exceeds the estimated pass fraction for every exam in the registry", () => {
    for (const exam of EXAMS) {
      const [lo, hi] = exam.manifest.scoreScale;
      const estimated = (exam.manifest.passingScore - lo) / (hi - lo);
      expect(exam.manifest.readinessTargetFraction, exam.manifest.id).toBeGreaterThan(estimated);
    }
  });

  it("overconfidence penalizes; underconfidence never inflates (correction 2, both directions)", () => {
    const input = baseInput();
    input.retrievability = () => 0.9; // all settled → coverage 1, strength 0.9
    // d3 overconfident (+0.2), d4 underconfident (−0.2):
    input.calibrationByDomain.d3 = { gap: 0.2, attempts: 50, statedMean: 0.9, accuracy: 0.7 };
    input.calibrationByDomain.d4 = { gap: -0.2, attempts: 50, statedMean: 0.5, accuracy: 0.7 };
    const r = computeReadiness(input);
    const d3 = r.domains.find((d) => d.domainId === "d3")!;
    const d4 = r.domains.find((d) => d.domainId === "d4")!;
    expect(d3.score).toBeCloseTo(0.7, 5); // below coverage × strength
    expect(d4.score).toBeCloseTo(0.9, 5); // exactly at it — never above
    expect(d4.calibrationGap).toBe(0); // clamped
  });

  it("decomposes readiness into coverage and strength and recommends the right lever (correction 3)", () => {
    const input = baseInput();
    // d1: half graduated at full strength → coverage 0.5, strength ~1.0.
    input.progress = input.progress.filter((p) => p.domainId !== "d1");
    input.progress.push(
      ...Array.from({ length: 5 }, (_, i) => settledCard(`d1-s${i}`, "d1")),
      ...Array.from({ length: 5 }, (_, i) => {
        const p = initialProgress(`d1-l${i}`, "cca-f", "d1", NOW);
        return { ...advanceState(p, true, NOW), atRisk: i < 2 }; // 2 flagged atRisk
      }),
    );
    // d2: all graduated but shaky.
    input.retrievability = (p) => (p.domainId === "d2" ? 0.5 : 1.0);
    const r = computeReadiness(input);
    const d1 = r.domains.find((d) => d.domainId === "d1")!;
    const d2 = r.domains.find((d) => d.domainId === "d2")!;
    // Same composite, opposite diagnoses:
    expect(d1.score).toBeCloseTo(d2.score, 2);
    expect(d1.coverage).toBeCloseTo(0.5, 5);
    expect(d1.strength).toBeCloseTo(1.0, 5);
    expect(d1.recommendedAction).toBe("new-material");
    expect(d1.atRiskCount).toBe(2);
    expect(d2.coverage).toBeCloseTo(1.0, 5);
    expect(d2.strength).toBeCloseTo(0.5, 5);
    expect(d2.recommendedAction).toBe("review");
  });

  it("display percent is floored, never rounded up", () => {
    const input = baseInput();
    input.retrievability = () => 0.899; // overall lands just below 0.9
    const r = computeReadiness(input);
    expect(r.displayPct).toBe(Math.floor(r.overall * 100));
    expect(r.displayPct).toBeLessThanOrEqual(89);
  });

  it("readiness can go DOWN when retrievability decays", () => {
    const input = baseInput();
    const high = computeReadiness({ ...input, retrievability: () => 0.95 });
    const low = computeReadiness({ ...input, retrievability: () => 0.7 });
    expect(low.overall).toBeLessThan(high.overall);
  });

  it("applies and LABELS the A7 familiarity penalty on thin over-exposed domains", () => {
    const input = baseInput();
    input.medianExposureByDomain.d1 = 5; // over-exposed on the thin d1 bank
    const r = computeReadiness(input);
    const d1 = r.domains.find((d) => d.domainId === "d1")!;
    expect(d1.familiarityPenalized).toBe(true);
    expect(d1.familiarityMultiplier).toBeLessThan(1);
    const d2 = r.domains.find((d) => d.domainId === "d2")!;
    expect(d2.familiarityPenalized).toBe(false);
  });

  it("calibration gap penalizes the domain score; the weakest domain is called out", () => {
    const input = baseInput();
    input.calibrationByDomain.d3 = { gap: 0.3, attempts: 50, statedMean: 0.9, accuracy: 0.6 };
    const r = computeReadiness(input);
    const d3 = r.domains.find((d) => d.domainId === "d3")!;
    expect(d3.score).toBeLessThan(0.7);
    expect(r.weakestDomainId).toBe("d3");
  });

  it("readiness grows only as cards graduate: settled retrievability is averaged over ALL domain cards", () => {
    const input = baseInput();
    // d2: 10 cards but only 2 settled — 8 stuck in learning.
    input.progress = input.progress.filter((p) => p.domainId !== "d2");
    const settled = [settledCard("d2-s1", "d2"), settledCard("d2-s2", "d2")];
    const learning = Array.from({ length: 8 }, (_, i) => {
      let p = initialProgress(`d2-l${i}`, "cca-f", "d2", NOW);
      p = advanceState(p, true, NOW);
      return p;
    });
    input.progress.push(...settled, ...learning);
    const r = computeReadiness(input);
    const d2 = r.domains.find((d) => d.domainId === "d2")!;
    expect(d2.score).toBeCloseTo((2 * 0.95) / 10, 3);
  });
});
