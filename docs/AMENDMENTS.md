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

---

# Diátaxis amendment (Jake, 2026-08-18) — A10

Apply Diátaxis (Procida, https://diataxis.fr — read start-here before
writing) in three layers. The value is the separation discipline, not the
four folders; mixing modes in one document degrades all of them.

## A10 Layer 2 — study-content classification (with Phase 3)

- **No restructuring.** Section parity (49 CCA-F / 8 SnowPro) is
  test-asserted and outranks tidiness. Metadata only:
  `diataxisMode: 'reference'|'explanation'|'how-to'|'tutorial'` +
  optional `diataxisMixed: true` for sections that legitimately span modes.
- Distribution is sanity-checked, not forced; an empty tutorial quadrant is
  a finding, not a failure. Thin explanation relative to the exams'
  reasoning emphasis is a content gap that feeds /gaps authoring priority.
- **Report the distribution before committing the classification.**
  STATUS: proposed classification in
  `scripts/migration/diataxis-classification.PROPOSED.json`, reported
  2026-08-18, awaiting Jake's check. Content files untouched until then.
- Functional payoff: future card generation is mode-aware (reference →
  recall cards; explanation → scenario/self-explanation cards; how-to →
  ordered-step cards). DONE in Phase 3: queue items carry a derived mode
  (recall→reference, scenario/trap→explanation, MC→exam-format), the mode
  renders on the card, and buildQueue never serves 3 consecutive same-mode
  items — /method must state this extension is reasoning by analogy from
  Rohrer & Taylor 2007, not separately validated.

## A10 Layers 1 + 3 — replaces Phase 5's documentation scope

Phase 5 is now: 7Rivers branding, PWA, offline, Vercel deploy config, PLUS:

- **Layer 1 (repo docs):** restructure into docs/{tutorials,how-to,
  reference,explanation} + generated docs/index.md; README reduced to an
  entry point routing to the quadrants; content/README.md split (how-to
  links to reference, never restates it); AMENDMENTS stays a log but every
  design-decision amendment gets its rationale extracted into an
  explanation doc (A1 → why-deadline-aware-scheduling.md; correction 1 →
  why-scaled-scores-are-not-raw-fractions.md); research citations stay in
  code AND appear in explanation docs. Naming: kebab-case; your-first-x /
  how-to-x / why-x; reference named for the thing.
- **Layer 3 (in-app):** /method = explanation only; /method/reference for
  the mechanical facts (state machine, readiness formula, FSRS params,
  constants); first-run onboarding = a 5-card tutorial teaching
  confidence-then-grade by doing (one path, no optionality, link to /method
  for why); empty states & settings help = one-task how-tos. /method states
  which mechanics are fully implemented (A9 carries over).
- **Lint (ships with Layer 1):** scripts/lint-diataxis.mjs wired into
  pnpm gate — reference: no second-person instructional openers; how-to: no
  extended rationale (>~100 words → link to explanation); tutorial: no
  optionality; explanation: no numbered procedural steps; frontmatter
  quadrant must match folder; docs/index.md generated only. Heuristics may
  false-positive: `diataxis-lint-ignore` with a required reason, every
  suppression listed in output.

Constraints: never rewrite exam content wording to satisfy structure or
lint — content fidelity outranks documentation structure everywhere they
conflict; no tutorial content invented to fill the quadrant; Diátaxis
governs prose, not code or route structure.

---

# A12 — Desktop column widening (Jake, A11 review rulings; Phase 5)

On wide-short viewports the phone-column Feed wastes horizontal space while
vertical space is scarce; fewer wrapped lines directly buys back the height
that was clipping content. Widen the content column when the viewport is
wide and short. Layout change with brand implications → belongs to the
Phase 5 visual work, not a defect pass. The empty-card-bodies-on-short-
answers cosmetic finding is expected to be resolved by the same change —
do not solve it twice.

Also ruled in the same review (implemented immediately, recorded here for
the trail): D5 fixed (home page build-status copy) + copy-audit assertion
(check 10) added to pnpm shots; fade-out scroll mask on clipped card
regions; 2s arming shows a progress fill (delay unchanged); skip-lapsed
cards are read-only for grading (revealable for learning, exactly one
review event, unit-tested); behavioral unit tests for shownAt/arming/
median/counters in lib/learning/session.ts — pixel-identical is not
behavior-identical.
