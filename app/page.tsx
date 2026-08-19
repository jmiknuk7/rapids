import Link from "next/link";
import { EXAMS } from "../content/registry";

/**
 * Phase 1: no product UI yet — this is the raw-content index for the
 * content-fidelity review gate. The real exam picker replaces this in
 * Phase 4/5; it must keep reading from the registry so a third exam
 * appears here with zero code changes.
 */
export default function Home() {
  return (
    <main className="mx-auto max-w-3xl p-8 font-mono text-sm">
      <h1 className="text-2xl font-bold">Rapids — Phase 1 content dump</h1>
      <p className="mt-2 text-neutral-500">
        Content-fidelity review build. No study UI yet. Composition per exam below; click through
        for the full raw dump.
      </p>
      <ul className="mt-6 space-y-4">
        {EXAMS.map((exam) => {
          const byType = exam.cards.reduce<Record<string, number>>(
            (m, c) => ((m[c.type] = (m[c.type] ?? 0) + 1), m),
            {},
          );
          return (
            <li key={exam.manifest.id} className="rounded border border-neutral-300 p-4">
              <div className="flex items-baseline gap-3">
                <span className="font-bold">{exam.manifest.name}</span>
                <Link
                  href={`/exam/${exam.manifest.slug}/feed`}
                  className="rounded px-2 py-0.5 font-bold text-white underline-offset-2"
                  style={{ backgroundColor: exam.manifest.accent }}
                >
                  ▶ Feed
                </Link>
                <Link href={`/dump/${exam.manifest.slug}`} className="underline">
                  raw dump
                </Link>
              </div>
              <div className="mt-1 text-neutral-600">
                sections={exam.sections.length} · cards={exam.cards.length} (
                {Object.entries(byType)
                  .map(([t, n]) => `${t}:${n}`)
                  .join(", ")}
                ) · questions={exam.questions.length} (official=
                {exam.questions.filter((q) => q.official).length}) · sources={exam.sources.length}
                {!exam.manifest.weightsVerified && (
                  <span className="ml-2 text-amber-700">⚠ domain weights unverified (derived)</span>
                )}
              </div>
            </li>
          );
        })}
      </ul>
      <p className="mt-8 text-xs text-neutral-400">
        Independent study tool. Not affiliated with, endorsed by, or sponsored by Snowflake Inc. or
        Anthropic PBC. Not an official 7Rivers product. Exam content compiled from publicly
        available official exam guides and vendor documentation.
      </p>
    </main>
  );
}
