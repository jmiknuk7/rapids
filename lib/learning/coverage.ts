import type { ExamContent } from "../../content/schema";

/**
 * Coverage ratio (Amendment A7). Bank share vs blueprint weight, derived
 * from the registry — never hardcoded. For CCA-F the bank is inversely
 * correlated with exam weight (d1: 27% weight, 15.5% share, ratio ≈ 0.57):
 * blueprint-weighted interleaving over a thin bank means every d1 question
 * repeats, and readiness rises on recognition rather than knowledge. The
 * app's job is to say that honestly — the blueprint weight stays correct,
 * the interleaver is NOT suppressed; the readiness contribution is
 * discounted and labeled, and authoring priority points where new question
 * writing pays back most.
 */

export const THIN_BANK_RATIO = 0.75;
export const FAMILIARITY_EXPOSURE_THRESHOLD = 3;
export const FAMILIARITY_PENALTY_FLOOR = 0.5;

export interface DomainCoverage {
  domainId: string;
  weight: number; // percent
  questionCount: number;
  bankShare: number; // 0..1 of the non-bonus bank
  coverageRatio: number; // bankShare / (weight/100)
  thinBank: boolean; // coverageRatio < 0.75
}

export function coverageByDomain(exam: ExamContent): DomainCoverage[] {
  const domains = exam.manifest.domains.filter((d) => !d.bonus);
  const bank = exam.questions.filter((q) => domains.some((d) => d.id === q.domainId));
  return domains.map((d) => {
    const questionCount = bank.filter((q) => q.domainId === d.id).length;
    const bankShare = bank.length ? questionCount / bank.length : 0;
    const coverageRatio = d.weight > 0 ? bankShare / (d.weight / 100) : 1;
    return {
      domainId: d.id,
      weight: d.weight,
      questionCount,
      bankShare,
      coverageRatio,
      thinBank: coverageRatio < THIN_BANK_RATIO,
    };
  });
}

/**
 * Familiarity penalty multiplier for a domain's readiness contribution:
 * active when medianExposure > 3 AND coverageRatio < 0.75. Discount scales
 * with how thin the bank is, floored at 0.5, and is always LABELED in the
 * readiness breakdown — never applied silently.
 */
export function familiarityPenalty(medianExposure: number, coverageRatio: number): number {
  if (medianExposure <= FAMILIARITY_EXPOSURE_THRESHOLD || coverageRatio >= THIN_BANK_RATIO)
    return 1;
  return Math.max(FAMILIARITY_PENALTY_FLOOR, coverageRatio / THIN_BANK_RATIO);
}

export function median(xs: number[]): number {
  if (xs.length === 0) return 0;
  const s = [...xs].sort((a, b) => a - b);
  const mid = Math.floor(s.length / 2);
  return s.length % 2 ? s[mid] : (s[mid - 1] + s[mid]) / 2;
}

/** Median exposureCount per domain from a per-question exposure map. */
export function medianExposureByDomain(
  exam: ExamContent,
  exposure: Map<string, number>,
): Record<string, number> {
  const out: Record<string, number> = {};
  for (const d of exam.manifest.domains.filter((x) => !x.bonus)) {
    const counts = exam.questions
      .filter((q) => q.domainId === d.id)
      .map((q) => exposure.get(q.id) ?? 0);
    out[d.id] = median(counts);
  }
  return out;
}

/**
 * Authoring priority (A7): where new question writing pays back most,
 * ranked by examWeight × (1 − coverageRatio), negatives clamped (a domain
 * with surplus coverage ranks 0).
 */
export function authoringPriority(
  exam: ExamContent,
): Array<DomainCoverage & { priority: number }> {
  return coverageByDomain(exam)
    .map((c) => ({ ...c, priority: (c.weight / 100) * Math.max(0, 1 - c.coverageRatio) }))
    .sort((a, b) => b.priority - a.priority);
}
