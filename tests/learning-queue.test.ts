import { describe, expect, it } from "vitest";
import {
  buildQueue,
  initialProgress,
  advanceState,
  DAY_MS,
  type CardProgress,
  type QueueInput,
} from "../lib/learning";
import { mulberry32 } from "../lib/learning/rng";
import { getExamById } from "../content/registry";

const NOW = Date.parse("2026-09-01T08:00:00Z");
const ccaf = getExamById("cca-f")!;

/** Progress with an FSRS due date set relative to now. */
function progressed(
  id: string,
  domainId: string | null,
  dueOffsetDays: number,
  opts: { atRisk?: boolean; toState?: number } = {},
): CardProgress {
  let p = initialProgress(id, "cca-f", domainId, NOW - 30 * DAY_MS);
  for (let i = 0; i < (opts.toState ?? 2); i++)
    p = advanceState(p, true, NOW - (10 - i) * DAY_MS);
  p.fsrs.due = new Date(NOW + dueOffsetDays * DAY_MS);
  p.atRisk = opts.atRisk ?? false;
  return p;
}

function baseInput(overrides: Partial<QueueInput> = {}): QueueInput {
  return {
    exam: ccaf,
    progress: new Map(),
    blindSpots: new Set(),
    examDate: null,
    examDateSetAt: null,
    sessionSize: 10_000,
    now: NOW,
    rng: mulberry32(42),
    ...overrides,
  };
}

describe("buildQueue (engine-owned, Phase 3 pre-brief item 1)", () => {
  it("every item carries a selection reason", () => {
    const q = buildQueue(baseInput());
    expect(q.length).toBeGreaterThan(200); // whole corpus is new
    for (const item of q) expect(["blind-spot", "at-risk", "due", "new"]).toContain(item.reason);
  });

  it("domain distribution converges on blueprint weights over a long queue", () => {
    const q = buildQueue(baseInput());
    // Count weighted-domain items only (bonus/cross items serve from the general pool).
    const weighted = q.filter(
      (i) => i.domainId !== null && i.domainId !== "proj",
    );
    const counts: Record<string, number> = {};
    for (const i of weighted) counts[i.domainId!] = (counts[i.domainId!] ?? 0) + 1;
    // The corpus itself is finite and unevenly stocked (d1 is thin), so exact
    // convergence is bounded by stock; assert the early queue tracks weights.
    const early = weighted.slice(0, 150);
    const earlyCounts: Record<string, number> = {};
    for (const i of early) earlyCounts[i.domainId!] = (earlyCounts[i.domainId!] ?? 0) + 1;
    for (const d of ccaf.manifest.domains.filter((x) => !x.bonus)) {
      const share = (earlyCounts[d.id] ?? 0) / early.length;
      expect(Math.abs(share - d.weight / 100), d.id).toBeLessThan(0.08);
    }
  });

  it("never serves 3 consecutive same-domain items while an alternative has stock", () => {
    const q = buildQueue(baseInput());
    const stock: Record<string, number> = {};
    for (const i of q) stock[i.domainId ?? "x"] = (stock[i.domainId ?? "x"] ?? 0) + 1;
    let run = 1;
    for (let i = 1; i < q.length; i++) {
      const d = q[i].domainId ?? "x";
      const prev = q[i - 1].domainId ?? "x";
      stock[prev]--;
      run = d === prev ? run + 1 : 1;
      const alternatives = Object.entries(stock).some(([k, n]) => k !== d && n > 0);
      if (alternatives) expect(run, `position ${i}`).toBeLessThanOrEqual(2);
    }
  });

  it("suppresses New items when consolidation mode is active", () => {
    // Window: set 30 days ago, exam in 5 days → final 20% (last 7 days) is active.
    const examDate = new Date(NOW + 5 * DAY_MS).toISOString().slice(0, 10);
    const examDateSetAt = new Date(NOW - 30 * DAY_MS).toISOString().slice(0, 10);
    const progress = new Map<string, CardProgress>();
    // Give a handful of items real due states so the queue is not empty.
    for (const c of ccaf.cards.slice(0, 20))
      progress.set(c.id, progressed(c.id, c.domainId, -1));
    const q = buildQueue(baseInput({ examDate, examDateSetAt, progress }));
    expect(q.length).toBeGreaterThan(0);
    expect(q.every((i) => i.reason !== "new")).toBe(true);
    // Control: same state without the deadline serves New items.
    const qOpen = buildQueue(baseInput({ progress }));
    expect(qOpen.some((i) => i.reason === "new")).toBe(true);
  });

  it("blind spots surface ahead of ordinary due items in their domain", () => {
    const progress = new Map<string, CardProgress>();
    const d1cards = ccaf.cards.filter((c) => c.domainId === "d1").slice(0, 12);
    for (const c of d1cards) progress.set(c.id, progressed(c.id, c.domainId, -1));
    const blindSpots = new Set([d1cards[10].id, d1cards[11].id]);
    const q = buildQueue(baseInput({ progress, blindSpots, sessionSize: 400 }));
    const d1positions = new Map(
      q.filter((i) => i.domainId === "d1").map((i, idx) => [i.id, idx]),
    );
    const blindPositions = [...blindSpots].map((id) => d1positions.get(id)!);
    const duePositions = d1cards
      .filter((c) => !blindSpots.has(c.id))
      .map((c) => d1positions.get(c.id)!)
      .filter((x) => x !== undefined);
    for (const bp of blindPositions)
      for (const dp of duePositions) expect(bp).toBeLessThan(dp);
    // And the reason label says so.
    for (const id of blindSpots)
      expect(q.find((i) => i.id === id)!.reason).toBe("blind-spot");
  });

  it("atRisk items outrank ordinary due items but not blind spots", () => {
    const progress = new Map<string, CardProgress>();
    const d2cards = ccaf.cards.filter((c) => c.domainId === "d2").slice(0, 9);
    for (const [i, c] of d2cards.entries())
      progress.set(c.id, progressed(c.id, c.domainId, -1, { atRisk: i === 0 }));
    const blindSpots = new Set([d2cards[1].id]);
    const q = buildQueue(baseInput({ progress, blindSpots, sessionSize: 400 }));
    const pos = (id: string) => q.findIndex((i) => i.id === id);
    expect(pos(d2cards[1].id)).toBeLessThan(pos(d2cards[0].id)); // blind spot first
    for (const c of d2cards.slice(2)) expect(pos(d2cards[0].id)).toBeLessThan(pos(c.id)); // at-risk next
    expect(q.find((i) => i.id === d2cards[0].id)!.reason).toBe("at-risk");
  });

  it("bonus-domain items are excluded from weighted sampling but still served from the general pool", () => {
    const q = buildQueue(baseInput());
    const projItems = q.filter((i) => i.domainId === "proj");
    expect(projItems.length).toBeGreaterThan(0); // proj cards/questions still appear...
    const first50 = q.slice(0, 50).filter((i) => i.domainId === "proj").length;
    expect(first50).toBeLessThan(8); // ...but nowhere near a weighted domain's share
  });

  it("items not due, not new, not prioritized are not served", () => {
    const progress = new Map<string, CardProgress>();
    for (const c of ccaf.cards) progress.set(c.id, progressed(c.id, c.domainId, +5));
    for (const qn of ccaf.questions) progress.set(qn.id, progressed(qn.id, qn.domainId, +5));
    const q = buildQueue(baseInput({ progress }));
    expect(q).toHaveLength(0);
  });

  it("respects sessionSize", () => {
    const q = buildQueue(baseInput({ sessionSize: 40 }));
    expect(q).toHaveLength(40);
  });

  it("every item carries a Diátaxis mode derived from its retrieval type (A10)", () => {
    const q = buildQueue(baseInput({ sessionSize: 300 }));
    for (const i of q) {
      if (i.kind === "question") expect(i.mode).toBe("exam-format");
      else expect(["reference", "explanation"]).toContain(i.mode);
    }
  });

  it("never serves 3 consecutive same-mode items while an alternative has stock (A10)", () => {
    const q = buildQueue(baseInput());
    const stock: Record<string, number> = {};
    for (const i of q) stock[i.mode] = (stock[i.mode] ?? 0) + 1;
    let run = 1;
    for (let i = 1; i < q.length; i++) {
      stock[q[i - 1].mode]--;
      run = q[i].mode === q[i - 1].mode ? run + 1 : 1;
      const alternatives = Object.entries(stock).some(([k, n]) => k !== q[i].mode && n > 0);
      if (alternatives) expect(run, `position ${i} (${q[i].mode})`).toBeLessThanOrEqual(2);
    }
  });

  it("mode run-breaking never breaks the domain constraint", () => {
    const q = buildQueue(baseInput());
    const stock: Record<string, number> = {};
    for (const i of q) stock[i.domainId ?? "x"] = (stock[i.domainId ?? "x"] ?? 0) + 1;
    let run = 1;
    for (let i = 1; i < q.length; i++) {
      const d = q[i].domainId ?? "x";
      const prev = q[i - 1].domainId ?? "x";
      stock[prev]--;
      run = d === prev ? run + 1 : 1;
      const alternatives = Object.entries(stock).some(([k, n]) => k !== d && n > 0);
      if (alternatives) expect(run, `position ${i}`).toBeLessThanOrEqual(2);
    }
  });
});
