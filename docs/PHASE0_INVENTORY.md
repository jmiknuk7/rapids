# Rapids — Phase 0 Content Inventory & Migration Plan

Compiled 2026-08-17 from clones of `jmiknuk7/snowpro-c03-guide` (commit 3c9fd64)
and `jmiknuk7/exam-prep-app` (commit 706db1e). Every file in both repos read in
full. All counts below are script-counted from the source arrays, not estimated.

---

## Exam 1: Claude Certified Architect – Foundations (CCA-F)

Source: `exam-prep-app/src/App.jsx` (single file holds the entire corpus).

### Manifest values (as stated in source)

| Field | Value | Where in source |
|---|---|---|
| Vendor | Anthropic | header/footer |
| Question count | 60 MC (1-of-4) | `EXAM_INFO.format` |
| Time limit | 120 minutes | `EXAM_INFO.format` |
| Passing score | 720 / 1000 scaled | `EXAM_INFO.passing` |
| Scenarios | 4 of 6 randomly selected per sitting | `EXAM_INFO.scenarios` |
| Proctoring | Recording-based (not live) | `EXAM_INFO.proctor` |
| Cost | $99 (free for first 5,000 CPN employees) | `EXAM_INFO.cost` |
| Score report | Within 2 business days | `EXAM_INFO.scoreReport` |
| Registration | anthropic.skilljar.com (EAP attestation flow) | ExamInfo "How to Access" |
| Official guide | Everpath S3 PDF, "v0.1, Feb 2026" per footer | Key Documentation links |

### Domains and weights (sum = 100, plus a 0-weight bonus domain)

| ID | Name | Weight | Source color |
|---|---|---|---|
| d1 | Agentic Architecture & Orchestration | 27 | #C2410C |
| d2 | Tool Design & MCP Integration | 18 | #0F766E |
| d3 | Claude Code Configuration | 20 | #1E40AF |
| d4 | Prompt Engineering & Structured Output | 20 | #7C3AED |
| d5 | Context Management & Reliability | 15 | #B45309 |
| proj | Projects (Bonus) | 0 | #475569 |

### Content counts (script-counted)

| Type | d1 | d2 | d3 | d4 | d5 | proj | Total |
|---|---|---|---|---|---|---|---|
| Read/review sections | 11 | 8 | 10 | 9 | 6 | 5 | **49** |
| Flashcards (Q/A) | 17 | 15 | 17 | 17 | 13 | 4 | **83** |
| MC quiz questions | 18 | 18 | 20 | 18 | 19 | 3 | **96** |

Of the 96 questions, **12 are marked `official: true`** — reproduced verbatim
from the official Anthropic exam guide PDF, each with a scenario tag
(Customer Support, Code Gen, Multi-Agent Research, Claude Code CI). The other
84 are derived: "extended" and "supplemental (task-statement-grounded)" blocks,
many citing specific exam-guide task numbers (e.g. "Task 1.2", "Task 4.5") in
their explanations.

Also in `EXAM_INFO`: 6 named exam scenarios with domain mappings, 16 in-scope
topics, 15 out-of-scope topics, 4 hands-on prep exercises, 5-step exam access
walkthrough, 7 Anthropic Academy course URLs, 11 documentation URLs.

### Citations present in source

- Official exam guide PDF (everpath-course-content S3 URL) — **official**
- docs.claude.com: Messages API, Tool Use, Message Batches — **official vendor docs**
- platform.claude.com: Agent SDK Overview, Hooks, Subagents — **official vendor docs**
- code.claude.com: Memory/CLAUDE.md, Headless, MCP — **official vendor docs**
- modelcontextprotocol.io — **official spec**
- anthropic.skilljar.com: 7 course URLs — **official**
- Footer attestation: "Content verified against the official Anthropic CCA-F
  exam guide (v0.1, Feb 2026), SDK docs, and MCP spec."

Citations are **corpus-level**, not per-item. No individual section/flashcard
carries its own source ID.

---

## Exam 2: SnowPro Core (COF-C03)

Source: `snowpro-c03-guide/index.html` (982 lines, entire corpus inline).

### Manifest values (as stated in source)

| Field | Value | Where in source |
|---|---|---|
| Vendor | Snowflake | throughout |
| Question count | 100 | spec strip |
| Time limit | 115 minutes | spec strip |
| Passing score | 750 / 1000 | spec strip |
| Cost | $175 per attempt | spec strip |
| Validity | 2 years (renew via Continuing Education) | exam-day section |
| Retakes | 7-day wait after fail, max 4 attempts / 12 months | exam-day section |
| Version | COF-C03 launched Feb 16 2026; C02 retired May 14 2026 | retire-note |
| Guide revision | January 19, 2026 study guide PDF | hero + footer |
| Registration/guide | learn.snowflake.com/en/certifications/snowpro-core-c03 | footer |

### Domains and weights (sum = 100 — but see flag ⚠ below)

| ID | Name | Weight | Source color |
|---|---|---|---|
| d1 | Snowflake AI Data Cloud Features & Architecture | ~31 | #14517D |
| d2 | Account Management & Data Governance | ~20 | #1F6FA8 |
| d3 | Data Loading, Unloading & Connectivity | ~18 | #3D8CBF |
| d4 | Performance Optimization, Querying & Transformation | ~21 | #2A7AA6 |
| d5 | Data Collaboration | ~10 | #6FA8CC |

⚠ All five weights carry a tilde in the source ("~31%") and the footer
attributes them to "the official COF-C03 exam guide **as summarized by
OpenExamPrep (open-exam-prep.com), retrieved July 2026**" — i.e. **derived,
not primary**. They sum to exactly 100 so they can pass validation, but the
manifest should record `weightsApproximate: true` (or equivalent) and cite the
OpenExamPrep source, with a MIGRATION_NOTES item to verify against the official
PDF.

### Content counts (script-counted)

| Type | d1 | d2 | d3 | d4 | d5 | Total |
|---|---|---|---|---|---|---|
| MC questions (`MC` + `MC_EXTRA`) | 35 | 25 | 26 | 29 | 18 | **133** |
| Free-recall prompts (`RECALL` + `RECALL_EXTRA`) | 11 | 11 | 11 | 11 | 8 | **52** |
| Inline trap callouts (domain sections) | 3 | 1 | 1 | 1 | 2 | **7** (+1 in d4 caches = counted) |
| "Why candidates fail" traps | — | — | — | — | — | **10** |
| Checklist topics | 6 | 7 | 6 | 7 | 4 | **30** |

(17 trap divs total: 7 inline + 10 in the fail-reasons panel.)

Long-form content: 5 domain sections containing 12 reference tables (editions,
table types, caches, stages, Snowpipe comparison, sharing mechanisms, system
roles, three-layer architecture, Cortex services, COPY options…), 6 SQL code
samples, a 4-method study-method panel with its protocol, a 6-week study plan,
and an exam-day strategy section (logistics, pacing, answer instinct, retakes).

The existing drill feed already implements: scroll-snap vertical feed,
Leitner-box spacing (5 boxes, due intervals 0/1/3/7/14 days), skip-counts-as-
miss via IntersectionObserver, checkpoint card every 12 answers with per-domain
mastery bars and weakest-domain callout, streak HUD. This is the conceptual
ancestor of the Rapids Feed; the FSRS + criterion engine replaces the Leitner
scheduler.

### Citations present in source (footer)

- Snowflake COF-C03 certification page & official study guide PDF (Jan 19,
  2026 revision) — learn.snowflake.com — **official**
- SnowPro Program Policies — learn.snowflake.com/en/pages/snowpro-policies — **official**
- SnowPro Continuing Education Program — **official**
- docs.snowflake.com — **official**
- Snowflake free trial — signup.snowflake.com — **official**
- Domain weights via OpenExamPrep (open-exam-prep.com), retrieved July 2026 — **derived**
- Study methods: Dunlosky et al. 2013 (PSPI 14:1) · Roediger & Karpicke 2006
  (Psych Sci 17:3) · Cepeda et al. 2006 (Psych Bull 132:3) · Rohrer & Taylor
  2007 (Instr Sci 35) · Chi et al. 1994 (Cog Sci 18:3) — **primary research**

Citations are corpus-level here too.

---

## Flags for MIGRATION_NOTES.md (found during inventory)

1. **SnowPro weights are derived** (OpenExamPrep summary, not the official PDF
   directly). Carry with `unverified: false` but `kind: 'derived'` + tilde
   preserved in display; verify against the official guide PDF before exam day.
2. **CCA-F 72%-raw ≈ 720-scaled conflation.** The source quiz marks ≥72% raw as
   "above 720/1000 passing threshold". Scaled scores are not raw percentages.
   Rapids mock exams will show raw % and label the pass line "estimated —
   vendor uses scaled scoring".
3. **SnowPro MC explanations mostly justify only the correct answer** — the
   why-each-distractor-fails requirement (engine mechanic #6) is not met for
   most of the 133 questions. CCA-F official questions DO have distractor
   rationale; many derived ones do too. Per-card flag `distractorRationale:
   false` where missing; listed in MIGRATION_NOTES for later enrichment.
   **Enrichment is out of scope for migration** — content integrity rule says
   don't invent; these render with a "correct-answer rationale only" note.
4. **Suspect uncited specifics in CCA-F sections** to mark `unverified: true`:
   "85% of CI integrations use this" (d3s8), "`--bare` … will become the
   default for -p" (d3s8). These read like changelog/anecdote, not exam-guide
   facts.
5. **Openflow caveat** in SnowPro d3: guide says excluded from scored questions
   until globally GA, "verify the current study guide PDF" — carried verbatim
   with its caveat.
6. **Existing browser progress does not migrate.** Both source apps store
   progress in device localStorage (`snowpro-c03-drill-v2`, `cca-study-v3`);
   there is no export path. Rapids starts fresh (and adds export/import so this
   never happens again).
7. **Mojibake in exam-prep `index.html` title** ("â€”") — encoding artifact,
   not carried over.
8. **CCA-F "proj" bonus domain** has weight 0. Schema must permit a
   zero-weight bonus domain excluded from readiness math and blueprint
   interleaving (source already excludes it from the weighted score).

---

## Migration map (source → Rapids content files)

### `content/exams/cca-f/`
- `manifest.ts` ← `DOMAINS` + `EXAM_INFO` (weights 27/18/20/20/15, 60Q, 120min,
  720/[0,1000], accent from d-colors over 7Rivers base, registration +
  official-guide URLs, scenario list, in/out-of-scope lists)
- `sections.ts` ← `SECTIONS` (49 items, verbatim bodies)
- `cards.ts` ← `FLASHCARDS` (83 → free-recall cards); scenario-tagged official
  questions also generate scenario cards; exam traps sourced from
  section bodies marked as anti-patterns stay in sections (no invented traps)
- `questions.ts` ← `QUIZ` (96 items; `official: true` preserved on 12; exam-guide
  task references preserved in explanations)
- `sources.ts` ← the 20+ URLs above, each tagged `official | derived`, with
  corpus-level source IDs referenced by every content item

### `content/exams/snowpro-c03/`
- `manifest.ts` ← spec strip + exam-day section (100Q, 115min, 750/[0,1000],
  weights ~31/~20/~18/~21/~10 with derived-weight flag, retake policy, validity)
- `sections.ts` ← the 5 domain sections (tables + code samples + notes,
  preserved as structured content), method panel, 6-week plan, exam-day
  strategy — with the 30 checklist topics as per-section review checklists
- `cards.ts` ← 52 RECALL → free-recall cards; 17 traps → trap cards (front =
  the plausible-wrong framing, back = why it fails, as written)
- `questions.ts` ← 133 MC (with `distractorRationale: false` where the
  explanation covers only the correct answer)
- `sources.ts` ← footer citations, official vs derived (OpenExamPrep flagged)

### Cross-cutting decisions (recorded, not blocking)
- Per-item citation model: items reference corpus-level source IDs (that is
  what the sources actually support); `unverified: true` reserved for items
  with no plausible source (flag #4). No per-item sources are invented.
- Stable card IDs: `{examId}-{type}-{domain}-{nnn}` in source order, so future
  content edits diff cleanly and review history survives content-file changes.
- SnowPro's Leitner drill stats and CCA-F's readiness formula are **not**
  migrated — replaced by the FSRS + criterion engine and the new readiness
  score. The old formulas are recorded in MIGRATION_NOTES for reference.

## Content NOT migrated (and why)
- Both apps' UI code (replaced wholesale by Rapids).
- CCA-F readiness formula (40% flash + 45% quiz + 15% sections + streak bonus,
  capped) — replaced by retrievability-based readiness; noted for reference.
- SnowPro localStorage schemas and v1→v2 migration shim — obsolete.
- recharts/lucide dependencies — Rapids has its own stack.

## Verification gates for Phase 1 (content fidelity)
- Script-count parity: 49/83/96 (CCA-F) and 133/52/17/30 (SnowPro) items in
  the new content files, enforced by unit test, not by eyeball.
- Domain weight sums = 100 per exam (Zod, build-time).
- 12 CCA-F questions retain `official: true` and byte-identical question text.
- Spot-check diff: N random items compared verbatim against source arrays.
