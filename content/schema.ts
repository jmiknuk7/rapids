import { z } from "zod";

/**
 * Content schema for Rapids. Every exam content file is validated against
 * these schemas at build time (`pnpm validate:content`, wired into the
 * Vercel build). Exams are data, not code: adding an exam means one folder
 * under content/exams/ and one line in registry.ts.
 */

export const DomainSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  short: z.string().min(1),
  /** Official blueprint weight, percent. Non-bonus weights must sum to 100. */
  weight: z.number().min(0).max(100),
  color: z.string().regex(/^#[0-9A-Fa-f]{6}$/),
  /**
   * A bonus domain (weight 0) is excluded from readiness math and from
   * blueprint-weighted interleaving (e.g. CCA-F "Projects (Bonus)").
   */
  bonus: z.boolean().optional(),
});

export const SourceSchema = z.object({
  id: z.string().min(1),
  title: z.string().min(1),
  url: z.string().url().optional(),
  /**
   * official = vendor primary source (exam guide, vendor docs).
   * derived  = third-party or compiled material (kept distinct on /sources).
   * research = peer-reviewed literature backing a learning mechanic.
   */
  kind: z.enum(["official", "derived", "research"]),
  license: z.string().optional(),
  retrieved: z.string().optional(),
  note: z.string().optional(),
});

/** Free-form exam logistics block rendered on the dashboard / exam info. */
export const ExamInfoSchema = z
  .object({
    format: z.string().optional(),
    passing: z.string().optional(),
    cost: z.string().optional(),
    proctoring: z.string().optional(),
    scoreReport: z.string().optional(),
    experience: z.string().optional(),
    validity: z.string().optional(),
    retakePolicy: z.string().optional(),
    versionNotes: z.string().optional(),
    scenarios: z.string().optional(),
    scenarioList: z
      .array(z.object({ name: z.string(), gist: z.string(), domains: z.string() }))
      .optional(),
    inScope: z.array(z.string()).optional(),
    outOfScope: z.array(z.string()).optional(),
    exercises: z
      .array(z.object({ title: z.string(), body: z.string(), domains: z.string() }))
      .optional(),
    accessSteps: z.array(z.string()).optional(),
    courses: z.array(z.object({ name: z.string(), url: z.string() })).optional(),
    docLinks: z.array(z.object({ name: z.string(), url: z.string() })).optional(),
  })
  .strict();

export const ManifestSchema = z.object({
  id: z.string().min(1),
  slug: z.string().min(1),
  name: z.string().min(1),
  shortName: z.string().min(1),
  vendor: z.string().min(1),
  /** Per-exam accent. Must pass WCAG AA on the dark surface (checked in Phase 5 brand pass). */
  accent: z.string().regex(/^#[0-9A-Fa-f]{6}$/),
  questionCount: z.number().int().positive(),
  timeLimitMinutes: z.number().int().positive(),
  passingScore: z.number(),
  scoreScale: z.tuple([z.number(), z.number()]),
  /**
   * Honest-scoring note: vendors use scaled scores; a raw percentage is an
   * estimate. Rendered wherever a mock score meets the passing line.
   */
  scoringNote: z.string().optional(),
  /**
   * Readiness uncap target (0..1). Deliberately set ABOVE the estimated
   * pass fraction derived from the scaled threshold: neither vendor
   * publishes a raw-to-scaled mapping, so a readiness score that uncaps
   * precisely at the nominal threshold says "ready" at the moment it is
   * most likely wrong. validateExam enforces target > estimated fraction.
   */
  readinessTargetFraction: z.number().gt(0).lt(1),
  domains: z.array(DomainSchema).min(1),
  registrationUrl: z.string().url(),
  officialGuideUrl: z.string().url(),
  /**
   * Amendment 2 (2026-08-17): false while domain weights rest on derived
   * (third-party) sources. Dashboard renders a notice while false, because
   * readiness scoring and blueprint interleaving depend on these weights.
   */
  weightsVerified: z.boolean(),
  /** True when the source materials hedge the weights ("~31%"). Preserved in display. */
  weightsApproximate: z.boolean().optional(),
  examInfo: ExamInfoSchema.optional(),
});

export const CardTypeSchema = z.enum(["recall", "scenario", "trap"]);

export const CardSchema = z.object({
  id: z.string().min(1),
  examId: z.string().min(1),
  /** null = cross-domain (e.g. pacing traps); excluded from the blueprint-weighted quota. */
  domainId: z.string().min(1).nullable(),
  type: CardTypeSchema,
  front: z.string().min(1),
  back: z.string().min(1),
  sourceIds: z.array(z.string().min(1)).min(1),
  /** Provenance tag carried from source material (e.g. "GitHub Q21"). */
  tag: z.string().optional(),
  /**
   * Content integrity rule: uncited behavioral/factual claims are carried
   * but badged. Uncited *statistics* are removed instead (Amendment 3).
   */
  unverifiedClaims: z.array(z.string()).optional(),
});

export const QuestionSchema = z.object({
  id: z.string().min(1),
  examId: z.string().min(1),
  domainId: z.string().min(1),
  question: z.string().min(1),
  options: z.array(z.string().min(1)).min(2),
  correctIndex: z.number().int().min(0),
  explanation: z.string().min(1),
  /**
   * Per-distractor counter-explanations keyed by option index ("0".."3").
   * Present on all avidevelops-sourced questions (contrib JSON) and most
   * exam-prep-app derived questions.
   */
  perOptionExplanations: z.record(z.string(), z.string()).optional(),
  examTakeaway: z.string().optional(),
  /**
   * False when the explanation justifies only the correct answer.
   * Renders an "explanation incomplete" marker (Amendment 4) and feeds
   * the /exam/[slug]/gaps authoring queue.
   */
  distractorRationale: z.boolean(),
  /** Verbatim from the official exam guide. Text is byte-frozen by test. */
  official: z.boolean(),
  scenario: z.string().optional(),
  tag: z.string().optional(),
  sourceIds: z.array(z.string().min(1)).min(1),
  unverifiedClaims: z.array(z.string()).optional(),
});

export const SectionSchema = z.object({
  id: z.string().min(1),
  examId: z.string().min(1),
  /** null = exam-wide section (study method, plan, exam-day strategy). */
  domainId: z.string().min(1).nullable(),
  title: z.string().min(1),
  /** Markdown. Tables and code fences preserved from source. */
  body: z.string().min(1),
  /** Topic checklist carried from source (SnowPro's 30 checkable topics live here). */
  checklist: z.array(z.string()).optional(),
  sourceIds: z.array(z.string().min(1)).min(1),
  unverifiedClaims: z.array(z.string()).optional(),
});

export type Domain = z.infer<typeof DomainSchema>;
export type Source = z.infer<typeof SourceSchema>;
export type ExamManifest = z.infer<typeof ManifestSchema>;
export type Card = z.infer<typeof CardSchema>;
export type Question = z.infer<typeof QuestionSchema>;
export type Section = z.infer<typeof SectionSchema>;

export interface ExamContent {
  manifest: ExamManifest;
  sources: Source[];
  cards: Card[];
  questions: Question[];
  sections: Section[];
}

/**
 * Cross-field validation for one exam. Returns a list of problems; empty
 * means valid. Used by scripts/validate-content.ts and the test suite.
 */
export function validateExam(exam: ExamContent): string[] {
  const problems: string[] = [];

  const m = ManifestSchema.safeParse(exam.manifest);
  if (!m.success) problems.push(`manifest: ${m.error.message}`);

  for (const s of exam.sources) {
    const r = SourceSchema.safeParse(s);
    if (!r.success) problems.push(`source ${s?.id}: ${r.error.message}`);
  }

  const weightSum = exam.manifest.domains
    .filter((d) => !d.bonus)
    .reduce((a, d) => a + d.weight, 0);
  if (weightSum !== 100)
    problems.push(`domain weights sum to ${weightSum}, expected 100 (bonus domains excluded)`);

  const [lo, hi] = exam.manifest.scoreScale;
  const estimatedPassFraction = (exam.manifest.passingScore - lo) / (hi - lo);
  if (exam.manifest.readinessTargetFraction <= estimatedPassFraction)
    problems.push(
      `readinessTargetFraction (${exam.manifest.readinessTargetFraction}) must exceed the ` +
        `estimated pass fraction (${estimatedPassFraction}) — the target is a safety margin ` +
        `above a threshold nobody can verify in raw terms`,
    );

  const domainIds = new Set(exam.manifest.domains.map((d) => d.id));
  const sourceIds = new Set(exam.sources.map((s) => s.id));
  const seenIds = new Set<string>();

  const checkItem = (
    kind: string,
    item: { id: string; examId: string; domainId: string | null; sourceIds: string[] },
  ) => {
    if (seenIds.has(item.id)) problems.push(`${kind} ${item.id}: duplicate id`);
    seenIds.add(item.id);
    if (item.examId !== exam.manifest.id)
      problems.push(`${kind} ${item.id}: examId ${item.examId} != ${exam.manifest.id}`);
    if (item.domainId !== null && !domainIds.has(item.domainId))
      problems.push(`${kind} ${item.id}: unknown domain ${item.domainId}`);
    for (const sid of item.sourceIds)
      if (!sourceIds.has(sid)) problems.push(`${kind} ${item.id}: broken source id ${sid}`);
  };

  for (const c of exam.cards) {
    const r = CardSchema.safeParse(c);
    if (!r.success) problems.push(`card ${c?.id}: ${r.error.message}`);
    checkItem("card", c);
  }
  for (const q of exam.questions) {
    const r = QuestionSchema.safeParse(q);
    if (!r.success) problems.push(`question ${q?.id}: ${r.error.message}`);
    checkItem("question", q);
    if (q.correctIndex >= q.options.length)
      problems.push(`question ${q.id}: correctIndex ${q.correctIndex} out of range`);
  }
  for (const s of exam.sections) {
    const r = SectionSchema.safeParse(s);
    if (!r.success) problems.push(`section ${s?.id}: ${r.error.message}`);
    checkItem("section", s);
  }

  return problems;
}
