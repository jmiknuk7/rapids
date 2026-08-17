import type { ExamManifest } from "../../schema";

/**
 * All values migrated from jmiknuk7/snowpro-c03-guide (commit 3c9fd64),
 * which compiled them from the official COF-C03 study guide (Jan 19, 2026
 * revision) — except the domain WEIGHTS, which that repo attributes to a
 * third-party summary (OpenExamPrep). Hence weightsVerified: false and
 * weightsApproximate: true (the source hedges every weight with "~").
 * The dashboard renders a notice while weightsVerified is false, because
 * readiness scoring and blueprint interleaving depend on these weights.
 * Jake will confirm against the official study guide PDF and flip the flag
 * (Amendment 2, 2026-08-17). Accent provisional until the Phase 5 brand pass.
 */
export const manifest: ExamManifest = {
  id: "snowpro-c03",
  slug: "snowpro-core-cof-c03",
  name: "SnowPro Core (COF-C03)",
  shortName: "SnowPro C03",
  vendor: "Snowflake",
  accent: "#4FA3D8",
  questionCount: 100,
  timeLimitMinutes: 115,
  passingScore: 750,
  scoreScale: [0, 1000],
  scoringNote:
    "750/1000 is a scaled score. Rapids mocks show raw percentage with the pass line labeled estimated — the vendor's scaling is not public.",
  domains: [
    { id: "d1", name: "Snowflake AI Data Cloud Features & Architecture", short: "Architecture", weight: 31, color: "#14517D" },
    { id: "d2", name: "Account Management & Data Governance", short: "Governance", weight: 20, color: "#1F6FA8" },
    { id: "d3", name: "Data Loading, Unloading & Connectivity", short: "Loading", weight: 18, color: "#3D8CBF" },
    { id: "d4", name: "Performance Optimization, Querying & Transformation", short: "Performance", weight: 21, color: "#2A7AA6" },
    { id: "d5", name: "Data Collaboration", short: "Collaboration", weight: 10, color: "#6FA8CC" },
  ],
  registrationUrl: "https://learn.snowflake.com/en/certifications/snowpro-core-c03",
  officialGuideUrl: "https://learn.snowflake.com/en/certifications/snowpro-core-c03",
  weightsVerified: false,
  weightsApproximate: true,
  examInfo: {
    format: "100 questions, 115 minutes (69 seconds per question average), online proctored via Pearson VUE OnVUE",
    passing: "750 / 1000. No penalty for wrong answers — never leave a blank.",
    cost: "$175 per attempt",
    validity: "2 years; renew via the Continuing Education program (an eligible ILT course or a higher SnowPro certification)",
    retakePolicy: "7-day wait after a fail, maximum 4 attempts per 12 months, full $175 each attempt",
    versionNotes:
      "COF-C03 launched Feb 16, 2026; the English COF-C02 retired May 14, 2026. Materials written for C02 still cover the foundations but miss the new C03 topics (Iceberg, Cortex, Dynamic Tables, Snowpipe Streaming, Trust Center, Git integration, QAS, Clean Rooms, Native Apps). Built on the Jan 19, 2026 study guide revision — verify current blueprint details against the official study guide before your exam date.",
  },
};
