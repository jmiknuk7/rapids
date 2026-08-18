import type { ExamManifest } from "../../schema";

/**
 * TEMPLATE — copy this folder to content/exams/<your-exam-id> and fill in
 * every value from the vendor's official exam guide. See content/README.md
 * for the rules (weights verification, source citation, ID conventions).
 *
 * This folder is NOT registered in content/registry.ts and never ships.
 */
export const manifest: ExamManifest = {
  id: "template",
  slug: "template-exam",
  name: "Template Exam — replace me",
  shortName: "TMPL",
  vendor: "Vendor Inc.",
  accent: "#4FA3D8", // must pass WCAG AA on the dark surface
  questionCount: 60,
  timeLimitMinutes: 90,
  passingScore: 700,
  scoreScale: [0, 1000],
  scoringNote: "Scaled score — raw percentages in mocks are estimates.",
  // Must exceed passingScore/scale as a fraction (validated): the readiness
  // uncap target is a deliberate safety margin above the nominal threshold.
  readinessTargetFraction: 0.8,
  domains: [
    // Non-bonus weights MUST sum to 100 (validated at build).
    { id: "d1", name: "Domain One", short: "One", weight: 60, color: "#14517D" },
    { id: "d2", name: "Domain Two", short: "Two", weight: 40, color: "#1F6FA8" },
    // Bonus domains: weight 0 + bonus: true (excluded from readiness/interleaving).
  ],
  registrationUrl: "https://example.com/register",
  officialGuideUrl: "https://example.com/exam-guide",
  // false until the weights are confirmed against the official guide:
  weightsVerified: false,
  weightsApproximate: true,
};
