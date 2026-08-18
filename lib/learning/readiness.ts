import type { ExamContent } from "../../content/schema";
import type { CardProgress } from "./types";
import { coverageByDomain, familiarityPenalty, type DomainCoverage } from "./coverage";
import type { CalibrationReport } from "./calibration";

/**
 * Readiness — honest, not a vanity metric.
 *
 * Per-domain composite: coverage × strength, where
 *   coverage = (Maintenance + Durable cards) ÷ ALL cards in the domain
 *   strength = mean predicted retrievability of those settled cards
 * penalized by the (overconfidence-only) calibration gap and — per
 * Amendment A7 — discounted when the domain's bank is thin AND its
 * questions are over-exposed (labeled, never silent).
 *
 * The composite collapses two opposite failure modes (half the domain
 * untouched at strength 1.0 vs all of it shaky at 0.5), so the breakdown
 * surfaces BOTH components and derives the recommended action from
 * whichever is lower: low coverage → new material; low strength → review.
 *
 * - Readiness can go DOWN (pure function of state; retrievability decays).
 * - Domains with fewer than 10 scored attempts show "insufficient data".
 * - Displayed percentages are FLOORED — never rounded up.
 * - The ≥90% uncap gate uses the exam's readinessTargetFraction — a
 *   deliberate margin ABOVE the estimated pass fraction. The estimated
 *   fraction is derived from the vendor's SCALED threshold (720/1000,
 *   750/1000); no vendor publishes a raw-to-scaled mapping, so treating it
 *   as a raw gate would say "ready" exactly where that is most likely
 *   wrong (Phase-2 review, correction 1).
 */

export const MIN_ATTEMPTS_FOR_SCORE = 10;
export const READINESS_CAP_BELOW_TARGET = 0.899;

/** Render next to any threshold line (readiness or mock pass line). */
export const THRESHOLD_LABEL =
  "estimated — vendor uses scaled scoring; target set above the nominal threshold as a margin";

/**
 * Derived from the vendor's scaled passing score. NOT a published
 * raw-percent threshold — no such threshold exists publicly for either
 * exam (Snowflake states none exists). Display only with THRESHOLD_LABEL.
 */
export function estimatedPassFraction(exam: ExamContent): number {
  const [lo, hi] = exam.manifest.scoreScale;
  return (exam.manifest.passingScore - lo) / (hi - lo);
}

export type RecommendedAction = "new-material" | "review" | "balanced";

export interface DomainReadiness extends DomainCoverage {
  status: "ok" | "insufficient-data";
  attempts: number;
  /** 0..1 after penalties; 0 when status is insufficient-data. */
  score: number;
  /** Settled (Maintenance+Durable) cards ÷ all cards in the domain. */
  coverage: number;
  /** Mean retrievability of the settled cards (0 when none settled). */
  strength: number;
  /** Which lever moves this domain: study new cards or review settled ones. */
  recommendedAction: RecommendedAction;
  /** A1 atRisk cards here — the ones that will never enter coverage before exam day. */
  atRiskCount: number;
  medianExposure: number;
  /** True when the A7 familiarity penalty was applied (always labeled). */
  familiarityPenalized: boolean;
  familiarityMultiplier: number;
  /** Overconfidence-only (clamped ≥ 0): underconfidence never inflates. */
  calibrationGap: number;
}

export interface ReadinessReport {
  overall: number; // 0..1
  /** Floored integer percent for display — never rounded up. */
  displayPct: number;
  /** True when the uncap rule held overall below 90%. */
  cappedBelowTarget: boolean;
  /** The uncap gate actually used (manifest readinessTargetFraction). */
  readinessTarget: number;
  /** Derived from the scaled threshold; display only with THRESHOLD_LABEL. */
  estimatedPassFraction: number;
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
  const coverageInfo = coverageByDomain(exam);
  const readinessTarget = exam.manifest.readinessTargetFraction;

  const domains: DomainReadiness[] = coverageInfo.map((cov) => {
    const attempts = input.attemptsByDomain[cov.domainId] ?? 0;
    const medianExposure = input.medianExposureByDomain[cov.domainId] ?? 0;
    // Correction 2 (confirmed clamped, now tested both directions):
    // overconfidence penalizes; underconfidence (negative gap) never inflates.
    const calibrationGap = Math.max(0, input.calibrationByDomain[cov.domainId]?.gap ?? 0);
    const multiplier = familiarityPenalty(medianExposure, cov.coverageRatio);

    const domainCards = progress.filter((p) => p.domainId === cov.domainId);
    const settled = domainCards.filter((p) => p.state === "durable" || p.state === "maintenance");
    const coverage = domainCards.length ? settled.length / domainCards.length : 0;
    const strength = settled.length
      ? settled.reduce((a, p) => a + retrievability(p), 0) / settled.length
      : 0;
    const atRiskCount = domainCards.filter((p) => p.atRisk).length;
    const recommendedAction: RecommendedAction =
      coverage < strength ? "new-material" : strength < coverage ? "review" : "balanced";

    if (attempts < MIN_ATTEMPTS_FOR_SCORE) {
      return {
        ...cov,
        status: "insufficient-data",
        attempts,
        score: 0,
        coverage,
        strength,
        recommendedAction,
        atRiskCount,
        medianExposure,
        familiarityPenalized: false,
        familiarityMultiplier: 1,
        calibrationGap,
      };
    }

    // coverage × strength ≡ Σ settled retrievability ÷ all cards: readiness
    // grows only as cards actually graduate, not because survivors score well.
    const penalized = Math.max(0, (coverage * strength - calibrationGap) * multiplier);
    return {
      ...cov,
      status: "ok",
      attempts,
      score: Math.min(1, penalized),
      coverage,
      strength,
      recommendedAction,
      atRiskCount,
      medianExposure,
      familiarityPenalized: multiplier < 1,
      familiarityMultiplier: multiplier,
      calibrationGap,
    };
  });

  // Weighted overall. Insufficient-data domains contribute 0 — the honest
  // direction: unknown is not pass.
  let overall = domains.reduce((a, d) => a + d.score * (d.weight / 100), 0);

  const everyDomainClearsTarget =
    domains.length > 0 && domains.every((d) => d.status === "ok" && d.score >= readinessTarget);
  let cappedBelowTarget = false;
  if (overall >= 0.9 && !everyDomainClearsTarget) {
    overall = READINESS_CAP_BELOW_TARGET;
    cappedBelowTarget = true;
  }

  const scoreable = domains.filter((d) => d.status === "ok");
  const weakest =
    scoreable.length > 0
      ? scoreable.reduce((w, d) => (d.score < w.score ? d : w), scoreable[0]).domainId
      : (domains[0]?.domainId ?? null);

  return {
    overall,
    displayPct: Math.floor(overall * 100), // never round up
    cappedBelowTarget,
    readinessTarget,
    estimatedPassFraction: estimatedPassFraction(exam),
    weakestDomainId: weakest,
    domains,
  };
}
