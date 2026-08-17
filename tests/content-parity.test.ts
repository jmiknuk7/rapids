import { describe, expect, it } from "vitest";
import { createHash } from "node:crypto";
import { EXAMS, getExamById } from "../content/registry";
import { validateExam } from "../content/schema";
import officialHashes from "./official-hashes.json";

/**
 * Phase 1 content-fidelity gate, mechanized. The expected numbers are the
 * REVISED counts approved after Amendment 5 (avidevelops merge + dedup),
 * not the original 49/83/96 inventory numbers:
 *
 *   CCA-F: 49 sections · 119 cards (83 recall + 23 scenario + 13 trap)
 *          · 119 questions (12 official + 75 retained derived + 32 avidevelops)
 *   SnowPro: 8 sections · 69 cards (52 recall + 17 trap) · 133 questions
 *
 * Composition is asserted by type and domain, never as a bare total.
 */

const ccaf = getExamById("cca-f")!;
const snowpro = getExamById("snowpro-c03")!;

const byType = (cards: { type: string }[]) =>
  cards.reduce<Record<string, number>>((m, c) => ((m[c.type] = (m[c.type] ?? 0) + 1), m), {});
const byDomain = (items: { domainId: string | null }[]) =>
  items.reduce<Record<string, number>>((m, q) => {
    const k = q.domainId ?? "cross";
    m[k] = (m[k] ?? 0) + 1;
    return m;
  }, {});

describe("registry", () => {
  it("holds both exams and validates cleanly", () => {
    expect(EXAMS).toHaveLength(2);
    for (const exam of EXAMS) expect(validateExam(exam)).toEqual([]);
  });

  it("non-bonus domain weights sum to 100 per exam", () => {
    for (const exam of EXAMS) {
      const sum = exam.manifest.domains.filter((d) => !d.bonus).reduce((a, d) => a + d.weight, 0);
      expect(sum, exam.manifest.id).toBe(100);
    }
  });
});

describe("CCA-F parity (revised counts, Amendment 5)", () => {
  it("sections: 49, all domain-scoped", () => {
    expect(ccaf.sections).toHaveLength(49);
    expect(byDomain(ccaf.sections)).toEqual({ d1: 11, d2: 8, d3: 10, d4: 9, d5: 6, proj: 5 });
  });

  it("cards: 83 recall + 23 scenario + 13 trap = 119", () => {
    expect(byType(ccaf.cards)).toEqual({ recall: 83, scenario: 23, trap: 13 });
    expect(ccaf.cards).toHaveLength(119);
  });

  it("questions: 119 = 12 official + 75 retained derived + 32 avidevelops", () => {
    expect(ccaf.questions).toHaveLength(119);
    expect(ccaf.questions.filter((q) => q.official)).toHaveLength(12);
    expect(ccaf.questions.filter((q) => q.id.startsWith("cca-f-q-av-"))).toHaveLength(32);
    expect(
      ccaf.questions.filter((q) => !q.official && !q.id.startsWith("cca-f-q-av-")),
    ).toHaveLength(75);
    expect(byDomain(ccaf.questions)).toEqual({ d1: 18, d2: 29, d3: 22, d4: 22, d5: 25, proj: 3 });
  });

  it("official question text is byte-identical to the source (SHA-256 frozen)", () => {
    const officials = ccaf.questions.filter((q) => q.official);
    expect(officials).toHaveLength(officialHashes.hashes.length);
    for (const { id, sha256 } of officialHashes.hashes) {
      const q = officials.find((o) => o.id === id);
      expect(q, id).toBeDefined();
      expect(createHash("sha256").update(q!.question, "utf8").digest("hex"), id).toBe(sha256);
    }
  });

  it("every avidevelops question carries per-distractor rationale for every wrong option", () => {
    for (const q of ccaf.questions.filter((x) => x.id.startsWith("cca-f-q-av-"))) {
      expect(q.distractorRationale, q.id).toBe(true);
      const wrong = q.options.map((_, i) => i).filter((i) => i !== q.correctIndex);
      for (const i of wrong) expect(q.perOptionExplanations?.[String(i)], `${q.id} option ${i}`).toBeTruthy();
    }
  });

  it("the 9 superseded exam-prep-app questions are absent (dedup regression guard)", () => {
    const needles = [
      "Invoice extraction sometimes produces totals that do not match line items",
      "Since then your team merged a PR that refactored the auth module",
      "Which MCP primitive fits exposing a catalog of database schemas",
      "source attribution is frequently lost during the handoff",
      "system prompt is a 40-step procedural checklist",
      "For parallel subagent execution in the Claude Agent SDK",
      "government report says 40% growth",
      "Leadership wants to automate 100% of processing",
      "You need the model to always call one specific tool for the first action",
    ];
    for (const n of needles) {
      expect(
        ccaf.questions.filter((q) => q.question.includes(n)),
        n,
      ).toHaveLength(0);
    }
  });

  it("the deleted uncited statistic is gone from the whole corpus (Amendment 3)", () => {
    const all = JSON.stringify([ccaf, snowpro]);
    expect(all).not.toContain("85% of CI integrations");
  });

  it("the --bare product-behavior claim is badged unverified, not deleted (Amendment 3)", () => {
    const s = ccaf.sections.find((x) => x.body.includes("--bare"));
    expect(s).toBeDefined();
    expect(s!.unverifiedClaims?.length).toBeGreaterThan(0);
  });
});

describe("SnowPro parity", () => {
  it("sections: 5 domain + method + plan + exam-day = 8; 30 checklist topics", () => {
    expect(snowpro.sections).toHaveLength(8);
    const checklist = snowpro.sections.flatMap((s) => s.checklist ?? []);
    expect(checklist).toHaveLength(30);
    expect(byDomain(snowpro.sections)).toEqual({ d1: 1, d2: 1, d3: 1, d4: 1, d5: 1, cross: 3 });
  });

  it("cards: 52 recall (11/11/11/11/8) + 17 trap = 69", () => {
    expect(byType(snowpro.cards)).toEqual({ recall: 52, trap: 17 });
    const recall = snowpro.cards.filter((c) => c.type === "recall");
    expect(byDomain(recall)).toEqual({ d1: 11, d2: 11, d3: 11, d4: 11, d5: 8 });
  });

  it("questions: 133 (35/25/26/29/18), all flagged missing distractor rationale", () => {
    expect(snowpro.questions).toHaveLength(133);
    expect(byDomain(snowpro.questions)).toEqual({ d1: 35, d2: 25, d3: 26, d4: 29, d5: 18 });
    // Amendment 4: these feed the /gaps authoring queue. Flag flips per
    // question only when rationale is authored (local override) or migrated.
    expect(snowpro.questions.every((q) => q.distractorRationale === false)).toBe(true);
  });

  it("weights are marked unverified until confirmed against the official PDF (Amendment 2)", () => {
    expect(snowpro.manifest.weightsVerified).toBe(false);
    expect(snowpro.manifest.weightsApproximate).toBe(true);
  });
});

describe("settings (Amendment 6)", () => {
  it("exam dates default to null — the scheduler never assumes an infinite horizon silently", async () => {
    const { defaultSettings } = await import("../lib/settings/schema");
    const s = defaultSettings();
    expect(s.exams).toEqual({});
    expect(s.retentionTarget).toBe(0.9);
  });
});
