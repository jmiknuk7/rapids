# Rapids content — exams are data, not code

Adding a third exam must mean **one folder and one registry line**. No
component changes, no route changes, no engine changes. If you find yourself
editing anything outside `content/` to add an exam, that is a bug in Rapids —
file it, don't work around it.

## How to add an exam

1. **Copy the template:**
   ```
   cp -r content/exams/_template content/exams/<your-exam-id>
   ```
2. **Fill in `manifest.ts`.** Every value must come from the vendor's official
   exam guide or be flagged: if the domain weights come from a third-party
   summary, set `weightsVerified: false` and `weightsApproximate: true`, and
   cite the actual source in `sources.ts` — the dashboard shows a notice until
   the weights are confirmed against the official guide.
3. **Fill in `sources.ts` first, content files second.** Every card, question,
   and section references source IDs. The content-integrity rules:
   - every item is traceable to a cited source (`sourceIds`),
   - uncited **statistics** are removed, not badged,
   - uncited **behavioral/factual claims** are carried with
     `unverifiedClaims: [...]` and render with a visible badge,
   - never invent, paraphrase-into-inaccuracy, or "improve" exam facts,
   - questions whose explanation does not cover **why each wrong answer is
     wrong** get `distractorRationale: false` — they render an "explanation
     incomplete" marker and appear in the `/exam/[slug]/gaps` authoring queue.
4. **Fill in `cards.ts`, `questions.ts`, `sections.ts`.** ID convention:
   `{examId}-{kind}-{domainId}-{nnn}` in source order (`kind` ∈ `recall`,
   `scen`, `trap`, `q`, `sec`). IDs are stable forever — review history hangs
   off them. Never renumber.
5. **Register it** in `content/registry.ts` (one import block, one array entry).
6. **Validate:** `pnpm validate:content` must pass. It fails the Vercel build
   on: broken source IDs, non-bonus domain weights that do not sum to 100,
   items referencing nonexistent domains, duplicate IDs, or missing required
   fields.
7. **Add a parity test** in `tests/` asserting your exam's composition by type
   and domain (never a bare total).

## Schema notes

- `weight: 0` + `bonus: true` marks a bonus domain (excluded from readiness
  scoring and blueprint-weighted interleaving).
- `domainId: null` on a card/section means cross-domain (served from the
  general pool, not the weighted quota).
- `official: true` on a question means verbatim vendor text; the test suite
  freezes it byte-for-byte (see `tests/official-hashes.json`).

## Provenance

`content/exams/cca-f/` and `content/exams/snowpro-c03/` were generated from
the source repos by `scripts/migration/gen-content.mjs` (committed, with its
run report). Editorial decisions live in `MIGRATION_NOTES.md`. Don't hand-edit
generated content silently: regenerate, or record the manual edit there.
