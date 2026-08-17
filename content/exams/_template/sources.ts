import type { Source } from "../../schema";

/**
 * TEMPLATE — fill sources FIRST; every card/question/section must reference
 * at least one of these IDs. kind: official (vendor primary), derived
 * (third-party/compiled — attribution and license recorded), research
 * (peer-reviewed literature).
 */
export const sources: Source[] = [
  {
    id: "template-exam-guide",
    title: "Official Exam Guide (version, date)",
    url: "https://example.com/exam-guide",
    kind: "official",
  },
  {
    id: "template-derived-example",
    title: "Third-party question bank (repo, commit)",
    url: "https://example.com/repo",
    kind: "derived",
    license: "CC BY 4.0",
    retrieved: "2026-01-01",
    note: "Attribution requirements go here.",
  },
];
