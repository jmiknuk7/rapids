import type { Source } from "../../schema";

export const sources: Source[] = [
  {
    id: "sp-exam-guide",
    title: "Snowflake COF-C03 certification page & official study guide PDF (Jan 19, 2026 revision)",
    url: "https://learn.snowflake.com/en/certifications/snowpro-core-c03",
    kind: "official",
  },
  {
    id: "sp-policies",
    title: "SnowPro Program Policies",
    url: "https://learn.snowflake.com/en/pages/snowpro-policies",
    kind: "official",
  },
  {
    id: "sp-cont-ed",
    title: "SnowPro Continuing Education Program",
    url: "https://learn.snowflake.com/en/snowpro-continuing-education",
    kind: "official",
  },
  { id: "sp-docs", title: "Snowflake Documentation", url: "https://docs.snowflake.com", kind: "official" },
  {
    id: "sp-trial",
    title: "Snowflake free trial ($400 credits / 30 days)",
    url: "https://signup.snowflake.com",
    kind: "official",
  },
  {
    id: "sp-openexamprep",
    title: "OpenExamPrep summary of the COF-C03 exam guide (domain weights)",
    url: "https://open-exam-prep.com",
    kind: "derived",
    retrieved: "2026-07",
    note: "The 31/20/18/21/10 weight pattern also appears across multiple independent third-party prep sources, all with hedged language (\"approximately\", \"common weighting pattern\") — corroborated but still derived, not primary (Jake's Phase-0 ruling, 2026-08-17). weightsVerified stays false until confirmed against the official study guide PDF.",
  },
  {
    id: "sp-src-guide-repo",
    title: "jmiknuk7/snowpro-c03-guide (source repo, commit 3c9fd64)",
    url: "https://github.com/jmiknuk7/snowpro-c03-guide",
    kind: "derived",
    retrieved: "2026-08-17",
    note: "Original SnowPro study guide PWA; all sections, questions, recall prompts, traps and checklists migrated from index.html.",
  },
  { id: "sp-research-dunlosky2013", title: "Dunlosky et al. (2013), Psychological Science in the Public Interest, 14(1)", kind: "research" },
  { id: "sp-research-roediger2006", title: "Roediger & Karpicke (2006), Psychological Science, 17(3)", kind: "research" },
  { id: "sp-research-cepeda2006", title: "Cepeda et al. (2006), Psychological Bulletin, 132(3)", kind: "research" },
  { id: "sp-research-rohrer2007", title: "Rohrer & Taylor (2007), Instructional Science, 35", kind: "research" },
  { id: "sp-research-chi1994", title: "Chi et al. (1994), Cognitive Science, 18(3)", kind: "research" },
];
