import type { Source } from "../../schema";

export const sources: Source[] = [
  {
    id: "ccaf-exam-guide",
    title: "Claude Certified Architect – Foundations Certification Exam Guide (v0.1, Feb 2026)",
    url: "https://everpath-course-content.s3-accelerate.amazonaws.com/instructor%2F8lsy243ftffjjy1cx9lm3o2bw%2Fpublic%2F1773274827%2FClaude+Certified+Architect+%E2%80%93+Foundations+Certification+Exam+Guide.pdf",
    kind: "official",
    note: "12 sample questions reproduced verbatim (marked official); domains, weights, scenarios, in/out-of-scope lists and exercises come from this guide.",
  },
  {
    id: "ccaf-src-exam-prep-app",
    title: "jmiknuk7/exam-prep-app (source repo, commit 706db1e)",
    url: "https://github.com/jmiknuk7/exam-prep-app",
    kind: "derived",
    retrieved: "2026-08-17",
    note: "Original CCA-F study app; sections, flashcards and the derived question bank migrated from src/App.jsx.",
  },
  {
    id: "ccaf-src-avidevelops",
    title: "avidevelops/claude-architect-exam-prep (33 scenario Q&As, commit 94e7d6a)",
    url: "https://github.com/avidevelops/claude-architect-exam-prep",
    kind: "derived",
    license: "CC BY 4.0",
    retrieved: "2026-08-17",
    note: "Attribution required and given on /sources: question content (c) avidevelops, CC BY 4.0; changes were made (restructuring into Rapids' content model). Per-option counter-explanations from contrib/expanded-counter-explanations.json (MSApps Mobile x OpsAgents, also CC BY 4.0).",
  },
  {
    id: "ccaf-src-handed-cards",
    title: "CCA_TikTok_Flashcards.jsx (hand-delivered file, 2026-08-17)",
    kind: "derived",
    retrieved: "2026-08-17",
    note: "23 scenario + 13 trap cards migrated. File header attributes content to the exam guide task statements and the avidevelops repo. Delivered file had mangled text encoding; glyphs restored editorially by context, words unchanged (see MIGRATION_NOTES.md).",
  },
  { id: "ccaf-docs-messages", title: "Claude Messages API docs", url: "https://docs.claude.com/en/api/messages", kind: "official" },
  { id: "ccaf-docs-tool-use", title: "Claude Tool Use docs", url: "https://docs.claude.com/en/docs/build-with-claude/tool-use/overview", kind: "official" },
  { id: "ccaf-docs-batches", title: "Claude Message Batches docs", url: "https://docs.claude.com/en/docs/build-with-claude/batch-processing", kind: "official" },
  { id: "ccaf-docs-agent-sdk", title: "Claude Agent SDK docs (overview, hooks, subagents)", url: "https://platform.claude.com/docs/en/agent-sdk/overview", kind: "official" },
  { id: "ccaf-docs-claude-code", title: "Claude Code docs (memory, headless, MCP)", url: "https://code.claude.com/docs/en/memory", kind: "official" },
  { id: "ccaf-docs-mcp-spec", title: "Model Context Protocol", url: "https://modelcontextprotocol.io/", kind: "official" },
  { id: "ccaf-academy", title: "Anthropic Academy courses (Skilljar)", url: "https://anthropic.skilljar.com", kind: "official" },
];
