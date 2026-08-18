import type { ExamContent } from "../../content/schema";
import type { CardProgress } from "./types";
import { coverageByDomain, familiarityPenalty, type DomainCoverage } from "./coverage";
import type { CalibrationReport } from "./calibration";

/**
 * Readiness — honest, not a vanity metric.
 *
 * Per-domain: (Σ predicted retrievability of Durable+Maintenance cards) ÷
 * total cards in the domain, penalized by the calibration gap and — per
 * Amendment A7 — discounted when the domain's bank is thin AND its
 * questions are over-exposed (labeled, never silent).
 *
 * - It can go DOWN (pure function of current state; retrievability decays).
 * - Domains with fewer than 10 scored attempts show "insufficient data",
 *   never an inflated number.
 * - Displayed percentages are FLOORED — never rounded up.
 * - Overall readiness never shows ≥90% unless every domain individually
 *   clears the passing threshold.
 */

export const MIN_ATTEMPTS_FOR_SCORE = 10;
export const READINESS_CAP_BELOW_PASSING = 0.899;

export interface DomainReadiness extends DomainCoverage {
  status: "ok" | "insufficient-data";
  attempts: number;
  /** 0..1 after penalties; 0 when status is insufficient-data. */
  score: number;
  medianExposure: number;
  /** True when the A7 familiarity penalty was applied (always labeled). */
  familiarityPenalized: boolean;
  familiarityMultiplier: number;
  calibrationGap: number;
}

export interface ReadinessReport {
  overall: number; // 0..1
  /** Floored integer percent for display — never rounded up. */
  displayPct: number;
  /** True when the ≥90% rule capped the overall score. */
  cappedBelowPassing: boolean;
  weakestDomainId: string | null;
  domains: DomainReadiness[];
}

export interface ReadinessInput {
  exam: ExamContent;
  progress: CardProgress[];
  /** Scored attempts per domain (question + card reviews). */
  attemptsByDomain: Record<string, number>;
  calibrationByDomain: Record<string, CalibrationReport>;
  medianExposureByDomain: Record<string, number>;
  /** Predicted recall probability for a card right now. */
  retrievability: (p: CardProgress) => number;
}

export function computeReadiness(input: ReadinessInput): ReadinessReport {
  const { exam, progress, retrievability } = input;
  const coverage = coverageByDomain(exam);
  const passingFraction =
    (exam.manifest.passingScore - exam.manifest.scoreScale[0]) /
    (exam.manifest.scoreScale[1] - exam.manifest.scoreScale[0]);

  const domains: DomainReadiness[] = coverage.map((cov) => {
    const attempts = input.attemptsByDomain[cov.domainId] ?? 0;
    const medianExposure = input.medianExposureByDomain[cov.domainId] ?? 0;
    const calibrationGap = Math.max(0, input.calibrationByDomain[cov.domainId]?.gap ?? 0);
    const multiplier = familiarityPenalty(medianExposure, cov.coverageRatio);

    if (attempts < MIN_ATTEMPTS_FOR_SCORE) {
      return {
        ...cov,
        status: "insufficient-data",
        attempts,
        score: 0,
        medianExposure,
        familiarityPenalized: false,
        familiarityMultiplier: 1,
        calibrationGap,
      };
    }

    const domainCards = progress.filter((p) => p.domainId === cov.domainId);
    const settled = domainCards.filter((p) => p.state === "durable" || p.state === "maintenance");
    // Retrievability of settled cards over ALL cards in the domain: readiness
    // grows only as cards actually graduate, not because the survivors score well.
    const base = domainCards.length
      ? settled.reduce((a, p) => a + retrievability(p), 0) / domainCards.length
      : 0;

    const penalized = Math.max(0, (base - calibrationGap) * multiplier);
    return {
      ...cov,
      status: "ok",
      attempts,
      score: Math.min(1, penalized),
      medianExposure,
      familiarityPenalized: multiplier < 1,
      familiarityMultiplier: multiplier,
      calibrationGap,
    };
  });

  // Weighted overall. Insufficient-data domains contribute 0 — the honest
  // direction: unknown is not pass.
  let overall = domains.reduce((a, d) => a + d.score * (d.weight / 100), 0);

  const everyDomainClears =
    domains.length > 0 &&
    domains.every((d) => d.status === "ok" && d.score >= passingFraction);
  let cappedBelowPassing = false;
  if (overall >= 0.9 && !everyDomainClears) {
    overall = READINESS_CAP_BELOW_PASSING;
    cappedBelowPassing = true;
  }

  const scoreable = domains.filter((d) => d.status === "ok");
  const weakest =
    scoreable.length > 0
      ? scoreable.reduce((w, d) => (d.score < w.score ? d : w), scoreable[0]).domainId
      : (domains[0]?.domainId ?? null);

  return {
    overall,
    displayPct: Math.floor(overall * 100), // never round up
    cappedBelowPassing,
    weakestDomainId: weakest,
    domains,
  };
}
