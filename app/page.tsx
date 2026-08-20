import Link from "next/link";
import { EXAMS } from "../content/registry";

/**
 * Exam picker. Reads the registry, so a third exam appears here with zero
 * code changes. Quiet and instrumental by design — the Feed is the
 * immersive surface. (A11 review, D5: no build-phase copy on shipped
 * routes; the copy-audit assertion in scripts/qa enforces it.)
 */
export default function Home() {
  return (
    <main className="mx-auto max-w-3xl p-8">
      <h1 className="text-3xl font-bold">Rapids</h1>
      <p className="mt-1 text-neutral-500">Certification prep, engineered.</p>
      <ul className="mt-8 space-y-4">
        {EXAMS.map((exam) => {
          const byType = exam.cards.reduce<Record<string, number>>(
            (m, c) => ((m[c.type] = (m[c.type] ?? 0) + 1), m),
            {},
          );
          return (
            <li key={exam.manifest.id} className="rounded-xl border border-neutral-300 p-5 dark:border-neutral-700">
              <div className="flex flex-wrap items-center gap-3">
                <span className="text-lg font-bold">{exam.manifest.name}</span>
                <Link
                  href={`/exam/${exam.manifest.slug}/feed`}
                  className="inline-flex min-h-11 items-center rounded-lg px-4 font-bold text-white"
                  style={{ backgroundColor: exam.manifest.accent }}
                >
                  ▶ Study
                </Link>
              </div>
              <div className="mt-2 text-sm text-neutral-500">
                {exam.sections.length} sections · {exam.cards.length} cards (
                {Object.entries(byType)
                  .map(([t, n]) => `${n} ${t}`)
                  .join(", ")}
                ) · {exam.questions.length} questions
                {exam.questions.some((q) => q.official) &&
                  ` (${exam.questions.filter((q) => q.official).length} from the official guide)`}
              </div>
              {!exam.manifest.weightsVerified && (
                <div className="mt-1 text-xs text-amber-700 dark:text-amber-500">
                  ⚠ Domain weights compiled from third-party sources — not yet verified against the
                  official study guide. Readiness scoring and interleaving depend on them.
                </div>
              )}
              <div className="mt-2 text-xs text-neutral-400">
                <Link href={`/dump/${exam.manifest.slug}`} className="inline-flex min-h-11 items-center underline">
                  content source review
                </Link>
              </div>
            </li>
          );
        })}
      </ul>
      <p className="mt-10 text-xs text-neutral-400">
        Independent study tool. Not affiliated with, endorsed by, or sponsored by Snowflake Inc. or
        Anthropic PBC. Not an official 7Rivers product. Exam content compiled from publicly
        available official exam guides and vendor documentation.
      </p>
    </main>
  );
}
