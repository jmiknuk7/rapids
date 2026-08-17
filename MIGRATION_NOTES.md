# MIGRATION_NOTES — living file

Every content item flagged as unverified, every value that couldn't be
extracted, and every judgment call made migrating ambiguous source content.
Phase 0 inventory and the six approved amendments: see `docs/AMENDMENTS.md`.

Generated content provenance: `scripts/migration/gen-content.mjs` (committed)
+ its run report `scripts/migration/migration-report.txt`. Sources at
migration time (2026-08-17): jmiknuk7/exam-prep-app @706db1e,
jmiknuk7/snowpro-c03-guide @3c9fd64, avidevelops/claude-architect-exam-prep
@94e7d6a, and the hand-delivered `CCA_TikTok_Flashcards.jsx`.

## Deletions (Amendment 3: uncited statistics are removed, not badged)

1. **"— 85% of CI integrations use this"** deleted from CCA-F section
   `cca-f-sec-d3-008` (headless mode). Uncited statistic teaching false
   precision; no exam value. Deletion is asserted by test
   (`content-parity.test.ts`) and by the generator (it fails if the target
   string is not found — source-drift guard).

## Unverified badges (uncited behavioral/factual claims — carried, badged)

2. **`--bare` "will become the default for -p"** in `cca-f-sec-d3-008`:
   product-behavior claim, checkable against Claude Code docs later.
   `unverifiedClaims` set; renders with a visible badge.

Amendment-3 sweep result: these were the only two candidates found in either
corpus. SnowPro's "roughly 54 study hours" and "$400 trial credits" were kept —
the former is the guide's own planning advice (not a factual claim about the
world), the latter is cited to signup.snowflake.com. Scenario-internal numbers
in questions ("97% accuracy", "18% of documents") are hypothetical scenario
setups, not real-world statistics.

## Dedup: 9 exam-prep-app questions superseded by avidevelops equivalents

Rule applied (Jake, Amendment 5): where scenarios overlap, prefer the version
with per-distractor rationale. None of the superseded questions were official.

| Removed (stable ID, never reused) | Superseded by | Shared teaching point |
| --- | --- | --- |
| cca-f-q-d4-017 | av Q1  | stated_total vs calculated_total + conflict_detected |
| cca-f-q-d1-018 | av Q18 | resume after code changes → inform agent of the delta |
| cca-f-q-d2-007 | av Q19 | MCP Resources for data catalogs |
| cca-f-q-d1-015 | av Q22 | structured content/metadata separation in handoffs |
| cca-f-q-d1-016 | av Q23 | goal-oriented over procedural subagent prompts |
| cca-f-q-d1-010 | av Q24 | parallel Task calls in a single response |
| cca-f-q-d5-009 | av Q25 | preserve conflicting values with attribution |
| cca-f-q-d5-006 | av Q30 | stratified accuracy segmentation before automating |
| cca-f-q-d2-010 | av Q33 | forced tool_choice for prerequisite ordering |

ID sequences keep their gaps (numbering was assigned over the full 96 before
removal) so IDs stay stable if a supersession is ever reverted.

Near-misses reviewed and deliberately KEPT as distinct (different question
stem or mechanism): Q3↔cca-f-q-d4 batch-cadence question (6h max-cost-efficiency
framing vs 4h reliability framing — both retained, see item 5), Q4↔d5
conflicting-statistics (schema design vs subagent behavior), Q7↔d2 reasoning
overload (dynamic scoping vs tool distribution — different correct fixes),
Q14↔official Q1 (in-tool threshold vs orchestration prerequisite), Q15/Q17↔
official Q2 (parameter- vs tool-level descriptions), Q27↔d5 attribution
(what's-missing vs how-to-fix), Q28↔d5 context degradation (crash recovery vs
degradation).

## avidevelops corpus notes

3. **Q29 is not an MC question.** It has no enumerated answer options in the
   source (confirmed by the contrib README, which omits it for the same
   reason). Its content ships as scenario card `cca-f-scen-d5-003` (the handed
   file's d5s3, tagged "GitHub Q29"). CCA-F MC from avidevelops = 32, not 33.
4. **Q3 contrib/README disagreement.** The README's answer was corrected to
   A — "submit every 6 hours" — in commit 579684e; the contrib enrichment
   (generated 2026-06-18) still says D. The README is the corrected authority:
   we use A, and Q3's per-option rationale comes from the README's own
   "weaker" bullets instead of the contrib JSON. The generator logs (and
   tolerates) exactly this class of disagreement.
5. **Q3 vs the retained exam-prep-app 4-hour question.** They look
   contradictory but ask different questions: Q3 asks for *maximum cost
   efficiency* (boundary answer: 6h); the exam-prep question asks how to hit
   the deadline *reliably* (buffered answer: 4h). Q3's migrated explanation
   carries the source's own real-world note distinguishing exam-correct from
   operationally-safe. Flagged here so Jake can judge whether keeping both is
   confusing rather than instructive.
6. **Domain assignment.** avidevelops doesn't use the official guide's domain
   names (its README says "Domain 4: API & Orchestration"; official D4 is
   Prompt Engineering & Structured Output). Rapids assigns each question by
   official-guide domain semantics. The contrib JSON's `domain` field
   disagrees with our assignment on 14 of 32 questions (logged in
   `migration-report.txt`); we kept official-semantics assignments.
7. **License:** avidevelops content is CC BY 4.0. Attribution is recorded in
   `sources.ts` and must be rendered on `/exam/[slug]/sources` (Phase 4) —
   "Source: avidevelops, https://github.com/avidevelops/claude-architect-exam-prep,
   CC BY 4.0", with changes indicated. The contrib enrichment (MSApps Mobile ×
   OpsAgents) is also CC BY 4.0.

## Hand-delivered CCA_TikTok_Flashcards.jsx

8. **Encoding restoration.** The file arrived with mangled text encoding
   (UTF-8 glyphs collapsed through Latin-1: bullets, arrows, check/cross
   marks, ≤/≠ rendered as `â`-sequences). Glyphs were restored editorially by
   context during transcription to `cca-handed-cards.json` (preserved in
   `scripts/migration/`); **words are unchanged**. Worth a skim during the
   fidelity review: the ✅/❌/→ restorations follow correct-vs-rejected-vs-inline
   context.
9. **38 of the file's 74 cards were not migrated.** Every flashcard (`t:"f"`)
   in the file is a merged restatement of 1–3 atomic flashcards already in the
   exam-prep-app 83-card corpus (the file was derived from it). Atomic cards
   are the better retrieval unit for the criterion system — "3 correct recalls"
   is ambiguous on a card that bundles three facts — so the existing 83 stay
   canonical and the merged variants were dropped as duplicates. The 23
   scenario + 13 trap cards are genuinely new types and migrated fully.
10. **Scenario cards intentionally coexist with their avidevelops MC
    siblings** (same teaching point, different retrieval mode: free recall of
    the fix vs recognition among options). The `tag` field ("GitHub Q21" etc.)
    links them. If the Feed ever feels repetitive, a relatedness link for the
    interleaver is the fix — noted for Phase 3.
11. **Trap-card domain assignment** (the file used a `trap` pseudo-domain;
    Rapids assigns real domains for blueprint interleaving): tp1→d1, tp2→d5,
    tp3→d4, tp4→d4, tp5→d5, tp6→d3, tp7→d1, tp8→d5, tp9→d5, tp10→d5, tp11→d2,
    tp12→d2, tp13→d1. Editorial; original IDs preserved in `tag`.

## SnowPro corpus notes

12. **Domain weights are derived** (Amendment 2). Attributed by the source
    repo to OpenExamPrep's summary; the 31/20/18/21/10 pattern is corroborated
    across multiple independent third-party prep sources but all hedge —
    derived, not primary (Jake's ruling, 2026-08-17). `weightsVerified: false`,
    `weightsApproximate: true`; dashboard notice until Jake confirms against
    the official study guide PDF and flips the flag (target: before Phase 2
    completes).
13. **All 133 MC questions have `distractorRationale: false`** — explanations
    justify the correct answer only. This is the highest-volume entry in the
    `/exam/[slug]/gaps` authoring queue (Amendment 4). Some explanations
    partially address distractors; the flag is conservative (unknown resolves
    to not-proven). No rationale was generated — per the integrity rule, Jake
    authors these via the /gaps override store.
14. **Trap cards use a mechanical front/back split** (no authored content):
    front = trap label + first sentence, back = full source text verbatim.
    Cross-domain traps (pacing, pre-C03 materials, official sample questions)
    carry `domainId: null`: snowpro-c03-trap-009/-015/-017.
15. **Openflow caveat carried verbatim** in the d3 section: excluded from
    scored questions until globally GA — "verify the current study guide PDF
    before your date."

## Structural decisions

16. **EXAM_INFO lives in `manifest.examInfo`**, not in sections — the spec's
    manifest owns "exam-day logistics". CCA-F section parity stays at 49.
    SnowPro's method/plan/exam-day panels ARE long-form study content and
    became 3 cross-domain sections (total 8).
17. **distractorRationale flag rule (both corpora):** true only for the 12
    official questions (verified: each explains every option) and the 32
    avidevelops questions (structured per-option rationale). The 75 retained
    exam-prep-app derived questions are false even where the prose partially
    covers distractors — conservative until verified per-question.
18. **Raw-vs-scaled scoring** (Phase-0 flag 2): both manifests carry
    `scoringNote`; mocks must show raw % with the pass line labeled estimated.
19. **Not migrated:** both apps' UI code; CCA-F's readiness formula
    (0.4·flash + 0.45·quiz + 0.15·sections + streak bonus ≤ 5%, capped at 1 —
    recorded here for reference); SnowPro's Leitner drill scheduler (5 boxes,
    0/1/3/7/14-day due intervals, skip-counts-as-miss — conceptual ancestor of
    the Feed, replaced by FSRS + criterion in Phase 2); device-local progress
    in either app's localStorage (no export path exists; Rapids ships
    export/import so this never recurs).
20. **Accent colors are provisional** until the Phase 5 7Rivers brand pass
    (WCAG AA on the dark surface is a hard requirement then).
21. **Mojibake em-dash in exam-prep-app's index.html `<title>`** — encoding
    artifact in the source repo, not carried over.

## Environment notes

22. Repo lives at `C:\Users\Jake.Miknuk\rapids` (outside OneDrive — sync churn
    on node_modules). pnpm installed per-user via `npm i -g pnpm` (corepack
    shim install needs admin on this machine).
