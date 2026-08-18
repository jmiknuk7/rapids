# Rapids

**Certification prep, engineered.** A multi-exam study platform built on
FSRS scheduling, successive relearning, confidence calibration, and
blueprint-weighted interleaving — every mechanic cited on the in-app
Method page. Built by Jacob Miknuk / 7Rivers.

> Independent study tool. Not affiliated with, endorsed by, or sponsored by
> Snowflake Inc. or Anthropic PBC. Not an official 7Rivers product. Exam
> content compiled from publicly available official exam guides and vendor
> documentation.

**Status: Phase 1** — content schema, registry, and both exam corpora
migrated and validated. No study UI yet (a raw content dump ships for the
fidelity review gate). Build phases and their gates: `docs/AMENDMENTS.md`,
`docs/PHASE0_INVENTORY.md`, `MIGRATION_NOTES.md`.

## Exams

| Exam | Content |
| --- | --- |
| Claude Certified Architect – Foundations (CCA-F) | 49 sections · 119 cards · 119 questions (12 verbatim-official) |
| SnowPro Core (COF-C03) | 8 sections · 69 cards · 133 questions |

Exams are **data, not code** — see `content/README.md` for how to add one
(one folder + one registry line, validated at build).

## Development

```bash
pnpm install
pnpm validate:content   # Zod + cross-field validation, fails the Vercel build
pnpm test               # content parity + integrity + engine tests (vitest)
pnpm gate               # validate + tests + full build + lint, one command
pnpm dev
```

**Phase protocol:** `pnpm gate` green is the defined precondition for any
phase-boundary commit. Local test success alone is not the gate — the full
build (strict TypeScript, static generation) and lint are part of it. This
became a rule after a Phase 2 commit went out with the build failing
type-check while vitest was green.

Content attribution: CCA-F question content includes material from
[avidevelops/claude-architect-exam-prep](https://github.com/avidevelops/claude-architect-exam-prep)
(CC BY 4.0, changes made). Full source registry per exam in
`content/exams/*/sources.ts`.
