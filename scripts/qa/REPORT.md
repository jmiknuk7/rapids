# A11 Visual QA Report — Phase 3

Sweep of 2026-08-19, run by `pnpm shots` (seed 7, clock frozen at
2026-09-05T12:00Z, fixtures preloaded, animations disabled; separate
reduced-motion pass). This file is regenerated each phase; per-run raw data
lives in `scripts/qa/out/assert-results.json` (gitignored with the sweep).

## 1. Matrix captured

**309 captures**: 7 viewports × (3 static routes + 40 feed cells) + 8
reduced-motion cells (4 states × 2 viewports).

- Routes captured: `/`, `/dump/[slug]` ×2, `/exam/[slug]/feed`.
- Feed states ×2 banner variants: recall/scenario/trap front+back,
  recall confidence-active, exam-format unanswered/confidence/revealed,
  skipped-lapsed, checkpoint, session-complete; plus computed worst cases
  (longest question, longest option set, longest card back, longest
  scenario — front and back) and a SnowPro sanity cell; `empty-deck`
  (single variant: requires the all-done fixture, which implies settings
  exist, so it is inherently a nobanner cell).

**Cells not captured, and why** — routes that do not exist until Phase 4/5:
`/exam/[slug]` dashboard, `/study`, `/mock`, `/blindspots`, `/sources`,
`/gaps`, `/method`, `/method/reference`, `/settings`. The matrix in
`shots.ts` picks them up as they land. Reduced-motion pass is scoped to 4
representative interactive cells × 2 viewports (a full doubled matrix adds
~8 minutes per run for states whose only motion difference is the flip);
scoping decision flagged for review.

**Two matrix cells changed meaning during the run** (see §2 defect F6):
until round 4, every `--nobanner`, `midsession`, and `empty-deck` cell
silently captured the wrong state because fixtures never loaded.

## 2. Defects found and fixed (assertion failure → after)

The five Phase 3 defects from the filed list — reconstructed from A11's
assertion descriptions, since the list itself wasn't attached; flagged in
case the mapping misses one:

| # | Defect | Caught by | Before | After |
|---|---|---|---|---|
| F1 | Options porthole: MC options collapsed into a tiny separate scroll region under a long question | check 1 | `clientHeight=65` (reported), reproduced as `clientHeight=72–199` at phone-landscape | each card face is ONE scroll region (question + options together); short-viewport chrome compaction; worst cell now 214px, 0 check-1 failures |
| F2 | Date input clipped off-viewport | check 2 | banner row overflow at 360px | banner wraps (`flex-wrap`), input `w-40 max-w-full h-11`; 0 feed check-2 failures |
| F3 | Confidence/grade rows off-viewport when chrome height changed | check 5 | fixed paddings assumed a fixed HUD height | HUD/bar heights measured into `--hud-h`/`--bar-h` via ResizeObserver; rows asserted fully in-viewport at all 7 viewports, 0 failures |
| F4 | Duplicate chips: `EXAM FORMAT` type chip + `exam-format` mode chip | check 7 | identical normalized text twice on question cards | mode chip skipped when it normalizes to the type label; 0 check-7 failures |
| F5 | Banner changes the height budget and breaks card layout | checks 1/4/5 | fixed `pt-32 pb-44` paddings ignored banner | same `--hud-h` fix as F3: the banner's measured height flows into slot padding; banner-present and -absent variants both pass |

Additional defects the loop itself surfaced:

| # | Defect | Caught by | Before | After |
|---|---|---|---|---|
| F6 | **Fixtures silently never loaded** — `page.evaluate("(async fx => …)")` evaluates the string to a function object without invoking it; every `--nobanner`/`midsession`/`empty-deck` cell captured the wrong state while looking plausible | my Part-3 sheet review (banner visible in `--nobanner` cells); no assertion could see it | all fixture cells wrong | real function passed to `evaluate` (serialized AND invoked), returns a `"populated"` marker the driver asserts on — a regression now fails loudly |
| F7 | Dump pages stretched to 484px at 360px viewport — `body` is a flex column (scaffold layout) and Chrome floors a flex item's stretched width at min-content; unbreakable JSON tokens (URLs) set min-content | check 2 (10,323 cascade failures from one root cause) | `main` w=484 at vw=360 | `min-w-0` + `overflow-wrap:anywhere` on dump main (NOT `break-words`, which loses the cascade battle and doesn't reduce min-content); 0 failures |
| F8 | "All" filter chip 38×44 — tap target fail | check 6 | 38px wide | `min-w-11 justify-center` on all HUD chips; 0 failures |
| F9 | Card scroll region 199px at phone-landscape — 1px under the 200px floor | check 1 | `clientHeight=199` | card-face padding compacts at ≤480px heights; content scrolls UNDER the action bar with its own bottom padding (`.feed-scroll-pad`), region now >210px |
| F10 | Dump `<pre>` JSON illegible in dark scheme (light `bg-neutral-100`, inherited light text) | Part-3 sheet review (contrast check had it, report-only) | ~1.1:1 contrast | `text-neutral-900` on the pre blocks |

## 3. Assertion run history

| Round | Captured | Check failures (1–7, 9) | Root causes |
|---|---|---|---|
| 1 | 309 | 10,432 across 115 cells (10,323 ×check-2, 84 ×check-6, 25 ×check-1) | F7 cascade, F8, F1/F9 landscape porthole |
| 2 | 309 | 10,337 (F7 fix hadn't landed — `break-words` overrode `overflow-wrap:anywhere`; 14 ×check-1 at 199px) | F7 root-caused to flex min-content flooring, F9 |
| 3 | 309 | **0** | — (but F6 discovered in review: fixture cells were capturing the wrong state) |
| 4 | 309 | **0** (fixtures actually loading, `--nobanner`/`empty-deck` cells now genuine) | — |
| 5 | 309 | **0**, and **0 baseline drift** against the 20 round-4 baselines — verifying that the React-compiler ref fixes (state mirrors for shownAt/progress, query-measured action bar) changed no pixels | — |

Contrast (check 8, report-only until Phase 5 brand colors): 295 cells carry
findings, dominated by `text-neutral-500` on the dark surface (≈4.0:1 vs
4.5 needed) and the placeholder home/dump pages. Inventory in
`assert-results.json`; F10 was the one actively harmful case and was fixed.

## 4. Per-screenshot review (Part 3)

Method: all 309 captures reviewed via contact sheets
(`scripts/qa/out/sheets/`, 12 thumbnails per sheet, position map in
`index.json`), with full-size reads of every cell a sheet flagged. Since 37
of the 44 cells repeat across 7 viewports with identical content and the
per-viewport differences are geometric, the lines below are written
per-cell with per-viewport deltas noted where they exist; every capture was
looked at. Review lines are in §4.1–4.3; findings NOT fixed are in §5.

### 4.1 Static routes (3 cells × 7 viewports = 21 captures)

- `home` ×7 — Exam list with composition lines; eye goes to the two accent
  Feed buttons first, which is the right primary action; disclaimers and the
  weights-unverified warning legible at every width; text wraps at 360px
  with no overflow. Utilitarian by design until Phase 5.
- `dump-ccaf` ×7 — JSON pre blocks now dark-on-light and legible (F10);
  URLs wrap (F7); at 360px it is dense but this is a review scaffold, not
  product UI. Eye goes to the h1, then section headers.
- `dump-snowpro` ×7 — same as above; markdown tables inside section bodies
  wrap as text rather than render as tables — acceptable for a dump page,
  listed as an unfixed finding (5.3).

### 4.2 Feed cells (40 cells × 7 viewports = 280 captures)

Format: cell — what is on screen / where the eye goes / full question &
options visible without scrolling? Each line covers its 7 viewports;
deltas called out where they exist.

- `recall-front--banner` — Question centered, disabled amber "Recall it
  first…" (arming state at capture t≈0.6s); eye: question → button. Full
  text visible at all 7. Banner + chips present; landscape drops chips (by
  design).
- `recall-front--nobanner` — identical minus banner; card gains the
  reclaimed height; verified banner genuinely absent (post-F6).
- `recall-confidence--banner/--nobanner` — confidence row appears in the
  fixed bottom position, four equal thumb-size targets, numbered hints;
  eye: question → row. No scroll needed at any viewport.
- `recall-back--banner/--nobanner` (+`--rm` at phone/desktop-wide-short) —
  Answer face with accent label; grade row in the same position the
  confidence row occupied (no thumb travel); rm variant renders flat
  crossfade, no mirrored text. Short answers leave a large empty card body
  at tablet/desktop (opinion 6.1).
- `scenario-front--banner/--nobanner` — long SCENARIO stem; at phone-sm and
  phone-landscape the stem fills the region and scrolls; scroll cue absent
  when the fold lands in a paragraph gap (finding 5.1). Eye: SCENARIO tag →
  stem.
- `scenario-back--banner/--nobanner` — ✅ block leads, ❌ blocks follow, 💡
  takeaways last; glyph colors read correctly on dark; long back scrolls
  inside the card with the grade row fixed below (landscape scrolls under
  the bar, gradient keeps the boundary legible).
- `trap-front--banner/--nobanner` — ⚠ TRAP framing reads as a
  challenge-the-claim prompt; distinct from recall fronts. Full text at all
  7.
- `trap-back--banner/--nobanner` — ❌ WRONG opens, ✅ CORRECT alternative
  follows; polarity unmistakable at a glance at every size.
- `examformat-unanswered--banner/--nobanner` (+`--rm`) — stem + 4 lettered
  options; options fully visible at ≥tablet; at phone/phone-sm long stems
  put later options below the fold with option A/B peeking as the scroll
  cue — acceptable; worst case covered in 5.1. Eye: stem → options.
- `examformat-confidence--banner/--nobanner` — picked option outlined, other
  options dimmed-disabled, confidence row up; state legible at all 7.
- `examformat-revealed--banner/--nobanner` (+`--rm`) — correct option green,
  wrong pick red, per-option rationale under each distractor, prose
  explanation + 💡 takeaway below, incomplete-rationale amber note absent
  here (official Q has full rationale); grade row correct-variant. On the
  wrong-pick worst-question variant the grade row locks to Again with
  hard/good/easy visibly disabled — the outcome-not-judgment rule is
  visually explicit.
- `skipped-lapsed--banner/--nobanner` — red "SKIPPED — COUNTED AS A LAPSE"
  chip on re-visit; card still answerable-looking (opinion 6.3: should a
  skipped card's controls re-arm?). Clear at all 7.
- `checkpoint--banner/--nobanner` — five domain bars, session stats line,
  "not a reward screen — a mirror" copy; fits without scrolling at every
  viewport including landscape (chips hidden there).
- `session-complete--banner/--nobanner` — stats table + weakest domain +
  single next action + Back to exams; banner correctly persists in the
  --banner variant (verified full-size after a thumbnail false alarm).
- `empty-deck--nobanner` — genuine empty state post-F6: summary slot with
  zeroed stats and "come back tomorrow; criterion needs separate days."
  Honest and quiet. (No --banner variant: the all-done fixture presupposes
  settings, i.e. a set date.)
- `snowpro-front--banner` — SnowPro accent (blue) on the attempt button and
  HUD, domain chips switch to the SnowPro set, switcher shows → CCA-F;
  per-exam theming works from the registry with zero code changes.
- `worst-question-front/back--banner/--nobanner` — the longest stem
  (creative-industries Q7): front scrolls inside the card, back shows all
  four options + rationale + explanation in one scroll region; at 1790×805
  (the original bug viewport) everything renders full-height with zero
  porthole. Wrong-pick → Again-locked grade row.
- `worst-options-front/back--banner/--nobanner` — longest option set (Q8
  scoped verify_fact): options dominate; A/B visible above the fold at
  phone widths, full set at desktop; back interleaves rationale per option
  without crowding.
- `worst-cardback-back--banner/--nobanner` — longest card back (PROMPT
  CHAINING scenario): numbered list + ❌ blocks + 💡 pair scroll cleanly;
  grade row never moves.
- `worst-scenario-back--banner/--nobanner` — PLAN MODE back with →-arrow
  flow lines; readable at every size.

### 4.3 Reduced-motion pass (8 captures)

- `recall-front/back, examformat-unanswered/revealed --banner--rm` at phone
  and desktop-wide-short — crossfade replaces the flip: no mirrored
  backface flash, correct face visible per state, controls identical to the
  motion variants. Geometry byte-identical to non-rm counterparts except
  the transform.

## 5. Findings NOT fixed, with reasons

1. **No scroll affordance when the fold lands in a content gap** (phone-sm
   / phone-landscape with the longest stems): the card region scrolls but
   nothing signals more content below when no option/text peeks. Not fixed:
   the geometry-only fix is a fade-out mask at the clipped edge, which is a
   visual-design call — parked as opinion 6.2 for your decision (A11 scope
   guard: no visual decisions beyond geometry this pass).
2. **Contrast inventory (check 8, 155 cells)**: dominated by
   `text-neutral-500` labels at ≈4.0:1 against the dark surface and the
   scaffold home/dump pages. Deliberately deferred to Phase 5 brand work
   per A11 ("report them, do not fail the run"), where the palette gets
   rebuilt against AA anyway.
3. **Dump pages render markdown tables as wrapped text** at narrow widths.
   Not fixed: dump is Phase-1 review scaffolding scheduled for replacement
   by the real study routes; wrapping is legible and non-overflowing.
4. **Skipped cards keep their attempt button live on revisit** — you can
   still answer a card already lapsed by skip (the lapse stands; a later
   answer is a new review). Whether that is correct pedagogy or double
   counting is a design question: opinion 6.3.
5. **`empty-deck--banner` cell does not exist** — matrix limitation, not a
   bug: the all-done fixture requires stored settings, which implies a set
   date. An all-done+no-date state is constructible but contrived; noted so
   the matrix's "every combination" claim is honest about the exception.

## 6. Opinions (defects vs opinions separated; these are yours to decide)

1. **Short-answer cards leave large empty bodies** at tablet/desktop — the
   card is height-fixed by the slot rather than hugging content. Hugging
   content would change flip geometry; a max-height with vertical centering
   is an alternative. Phase 5 brand/layout territory.
2. **Fade-out scroll mask** on card scroll regions (pairs with finding 5.1).
3. **Skipped-card semantics on revisit** (pairs with finding 5.4): re-arm,
   lock, or leave as-is.
4. **Desktop is a phone column in a black field** — faithful to mobile-first
   and "quiet and instrumental," but at 1440+ the Feed could justify a
   wider card or side-by-side reveal. Phase 5.
5. **The 2s arming label** ("Recall it first…") reads as a state, not a
   countdown; a subtle progress indication on the button would communicate
   the arming without softening the friction. Phase 5 if at all.

## 7. The five filed defects — status

All five (as reconstructed in §2, F1–F5): **fixed**, each now caught by the
named assertion in `scripts/qa/assert-layout.mjs`, which runs at every
matrix cell on every `pnpm shots`, which runs inside `pnpm gate`. The
regression path is closed mechanically, not by vigilance. F6–F10 (found by
this loop) are also fixed, with F6's marker assertion making a silent
fixture failure impossible.

## 8. Baselines

20 committed under `scripts/qa/baselines/`: the two longest-content backs
at all 7 viewports + banner-present fronts at the three riskiest viewports
+ confidence-row and empty-deck anchors. Pixel-diff threshold 0.5%; a
changed baseline requires an explicit commit-message note (A11 Part 4);
`--update-baselines` only rewrites existing files, never silently adds.
