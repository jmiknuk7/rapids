import type { Rng } from "./rng";

/**
 * Blueprint-weighted interleaving. Domains are sampled proportional to
 * their official exam weight — a 27%-weight domain gets ~27% of queue
 * slots, not an equal share — and the queue never serves more than 2
 * consecutive items from the same domain.
 *
 * Cross-domain items (domainId null) are served from a general pool sized
 * by its share of the due items. Bonus domains (weight 0) are excluded from
 * the weighted quota by construction (weight 0 → never sampled) but their
 * items can be passed in the general pool by the caller.
 *
 * Thin banks are NOT suppressed here (Amendment A7): the blueprint weight
 * is correct even when the bank is thin — honesty about over-exposure lives
 * in the readiness formula, not in studying the heaviest domain less.
 *
 * Citation (/method): Rohrer & Taylor (2007), Instructional Science 35,
 * 481–498 — interleaved practice beats blocked practice at test.
 */

export const MAX_CONSECUTIVE_SAME_DOMAIN = 2;

export interface InterleaveInput<T> {
  /** Items per domain, each list already in priority order (blind spots first). */
  pools: Map<string | null, T[]>;
  /** Blueprint weight (percent) per domain id. Missing/0 → excluded from quota. */
  weights: Record<string, number>;
  rng: Rng;
}

export function interleave<T>({ pools, weights, rng }: InterleaveInput<T>): T[] {
  // Work on copies; never mutate caller state.
  const remaining = new Map<string | null, T[]>();
  for (const [k, v] of pools) if (v.length) remaining.set(k, [...v]);

  const out: T[] = [];
  const recent: (string | null)[] = [];

  const generalShare = (): number => {
    const general = remaining.get(null)?.length ?? 0;
    const total = [...remaining.values()].reduce((a, v) => a + v.length, 0);
    return total ? general / total : 0;
  };

  while ([...remaining.values()].some((v) => v.length > 0)) {
    // Candidate domains: non-empty, and not about to exceed the consecutive cap.
    const lastTwoSame =
      recent.length >= MAX_CONSECUTIVE_SAME_DOMAIN &&
      recent.slice(-MAX_CONSECUTIVE_SAME_DOMAIN).every((d) => d === recent[recent.length - 1]);
    const blocked = lastTwoSame ? recent[recent.length - 1] : undefined;

    let candidates = [...remaining.keys()].filter((k) => (remaining.get(k)?.length ?? 0) > 0);
    if (blocked !== undefined && candidates.length > 1)
      candidates = candidates.filter((k) => k !== blocked);

    // Weight each candidate: blueprint weight for real domains, current pool
    // share for the general (null) pool.
    const gShare = generalShare();
    const weighted = candidates.map((k) => ({
      k,
      w: k === null ? gShare * 100 : (weights[k] ?? 0),
    }));
    let totalW = weighted.reduce((a, x) => a + x.w, 0);
    if (totalW <= 0) {
      // Only zero-weight pools left; serve them uniformly.
      for (const x of weighted) x.w = 1;
      totalW = weighted.length;
    }

    let r = rng() * totalW;
    let pick = weighted[weighted.length - 1].k;
    for (const x of weighted) {
      r -= x.w;
      if (r <= 0) {
        pick = x.k;
        break;
      }
    }

    const pool = remaining.get(pick)!;
    out.push(pool.shift()!);
    recent.push(pick);
    if (pool.length === 0) remaining.delete(pick);
  }

  return out;
}
