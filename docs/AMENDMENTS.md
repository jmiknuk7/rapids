# Phase-0 approval amendments (Jake, 2026-08-17) — standing contract

Phase 0 inventory approved with six amendments. These bind Phases 1–5.
Phase 1 items are DONE (see MIGRATION_NOTES.md); the rest are the contract
for the phases that implement them.

## A1 — Deadline-aware scheduling (Phase 2, highest priority)

Peak retention on one specific date, not generic long-term retention.

- `/settings`: per-exam target date (schema landed in Phase 1:
  `lib/settings/schema.ts`, defaults null; dashboard must PROMPT when null,
  never silently schedule as if the horizon were infinite).
- Compute `daysToExam` per exam.
- Clamp FSRS-proposed intervals so no card schedules past `examDate - 1`;
  every card gets at least one review inside the window.
- While `daysToExam` < ~6 weeks: gap = `min(fsrsInterval, 0.2 * daysToExam)`,
  never below 1 day.
- Terminal phase: final 20% of the window stops introducing New cards; queue
  shifts to Maintenance + Blind Spots only. Dashboard surfaces "consolidation
  mode" with its start date.
- Cards that cannot reach Criterion before the exam at current daily volume:
  mark `atRisk`, show a dashboard count. Never silently drop.
- Citation for /method: Cepeda, Vul, Rohrer, Wixted & Pashler (2008),
  Psychological Science, 19(11), 1095–1102, doi:10.1111/j.1467-9280.2008.02209.x —
  optimal gap ≈ proportion of retention interval (~20% at a few weeks,
  5–10% at a year). State plainly: this is an adaptation of a two-session
  laboratory finding to a multi-session scheduler, not a directly validated
  implementation.
- Unit tests: no scheduled interval ever exceeds `daysToExam`; consolidation
  mode triggers on the correct date.

## A2 — SnowPro weights (DONE in Phase 1, one action open)

Derived flag + tildes kept; corroboration recorded in sources.ts;
`weightsVerified: false` in the manifest; dashboard notice while false
(notice UI lands with the dashboard in Phase 4; the Phase 1 dump page
already shows the flag). OPEN: Jake downloads the official study guide from
learn.snowflake.com, confirms 31/20/18/21/10, flips the flag — before Phase 2
completes.

## A3 — Uncited-claim rule (DONE in Phase 1, applies forever)

Uncited **statistics** are removed (recorded); uncited **behavioral/factual
claims** are badged `unverifiedClaims`. Applied across both corpora during
migration; applies to all future content.

## A4 — /exam/[slug]/gaps authoring queue (Phase 4)

- Lists every question with `distractorRationale: false`, sorted by
  `domainWeight × questionFrequency` descending (frequency = how often the
  question has been served, from review history).
- Each row: question, current correct-answer-only explanation, and a text
  field writing to a local override store (IndexedDB layer, exportable with
  the rest of the data).
- Visible "explanation incomplete" marker on any card reveal where the flag
  is false (marker already rendered in the Phase 1 dump).
- Rapids never generates rationale itself.

## A5 — Third CCA-F source (DONE in Phase 1)

avidevelops/claude-architect-exam-prep merged (CC BY 4.0, attribution in
sources.ts and required on /sources): 32 MC questions with per-distractor
rationale (Q29 is card-only — no options in source), 9 exam-prep-app
questions superseded, 23 scenario + 13 trap cards from the hand-delivered
file. Revised parity counts (asserted by test):

- CCA-F: 49 sections · 119 cards (83 recall + 23 scenario + 13 trap) ·
  119 questions (12 official + 75 retained derived + 32 avidevelops)
- SnowPro: 8 sections · 69 cards (52 recall + 17 trap) · 133 questions

## A6 — Exam dates land in Phase 1 (DONE)

`lib/settings/schema.ts` defines per-exam `examDate` (nullable, default
null). Dashboard prompts for a date rather than silently scheduling on an
infinite horizon.

---

# Phase-1 sign-off additions (Jake, 2026-08-18)

## A7 — Coverage ratio enters the readiness formula (Phase 2)

CCA-F bank share is inversely correlated with exam weight (d1: 27% weight,
15.5% bank share, ratio 0.57). Blueprint interleaving over a thin bank
inflates readiness via recognition. Required:

- `coverageRatio = bankShare / examWeight` per domain, derived in the
  manifest layer (computed from registry, never hardcoded).
- Track `exposureCount` per question; compute `medianExposure` per domain.
- Familiarity penalty: when a domain's `medianExposure` > 3 AND its
  `coverageRatio` < 0.75, discount that domain's readiness contribution and
  label it explicitly in the breakdown — never silently.
- Dashboard domain breakdown shows coverage ratio; any domain < 0.75 renders
  a "thin bank" indicator with its question count.
- `/gaps` companion view/filter: authoring priority ranked by
  `examWeight × (1 − coverageRatio)` — for CCA-F, d1 tops it by a wide margin.
- Do NOT suppress d1 in the interleaver. The blueprint weight is correct;
  the bank is thin. Tell the truth, don't study d1 less.

## A8 — Cross-reference near-duplicate stems (Phase 4)

- Add `relatedQuestionIds` to the question schema.
- Link the Q3 pair (cca-f-q-av-q03 "max cost efficiency" → 6h ↔ the retained
  4h "reliably" question). Each explanation must name the discriminating
  phrase and state why the other's answer differs. Render related questions
  on reveal.
- Scan both corpora for other near-duplicate stems with divergent answers
  during Phase 4 and report findings. Well-cross-referenced near-duplicate
  pairs train feature discrimination — higher value than either question
  alone.

## A9 — /method must state the self-explanation gap plainly (Phase 4)

208 of 252 questions (83%) lack per-distractor rationale until the /gaps
authoring work is done. The /method page describes self-explanation as
partially available and points at the /gaps queue — it must not describe the
mechanic as fully implemented while most of the corpus lacks it.
