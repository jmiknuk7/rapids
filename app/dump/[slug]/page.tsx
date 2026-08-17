import { notFound } from "next/navigation";
import { EXAMS, getExamBySlug } from "../../../content/registry";

export function generateStaticParams() {
  return EXAMS.map((e) => ({ slug: e.manifest.slug }));
}

/** Phase 1 raw dump: every migrated content item, unstyled, for fidelity review. */
export default async function DumpPage({ params }: PageProps<"/dump/[slug]">) {
  const { slug } = await params;
  const exam = getExamBySlug(slug);
  if (!exam) notFound();

  return (
    <main className="mx-auto max-w-4xl p-8 font-mono text-xs">
      <h1 className="text-xl font-bold">{exam.manifest.name} — raw content</h1>

      <h2 className="mt-6 text-lg font-bold">manifest</h2>
      <pre className="whitespace-pre-wrap rounded bg-neutral-100 p-3">
        {JSON.stringify(exam.manifest, null, 2)}
      </pre>

      <h2 className="mt-6 text-lg font-bold">sources ({exam.sources.length})</h2>
      <pre className="whitespace-pre-wrap rounded bg-neutral-100 p-3">
        {JSON.stringify(exam.sources, null, 2)}
      </pre>

      <h2 className="mt-6 text-lg font-bold">sections ({exam.sections.length})</h2>
      {exam.sections.map((s) => (
        <details key={s.id} className="mt-2 rounded border border-neutral-300 p-2">
          <summary>
            [{s.id}] {s.title} {s.unverifiedClaims?.length ? "⚠ unverified claims" : ""}
          </summary>
          <pre className="mt-2 whitespace-pre-wrap">{s.body}</pre>
          {s.checklist && (
            <ul className="mt-2 list-disc pl-6">
              {s.checklist.map((c, i) => (
                <li key={i}>{c}</li>
              ))}
            </ul>
          )}
          {s.unverifiedClaims && (
            <pre className="mt-2 whitespace-pre-wrap text-amber-700">
              {s.unverifiedClaims.join("\n")}
            </pre>
          )}
        </details>
      ))}

      <h2 className="mt-6 text-lg font-bold">cards ({exam.cards.length})</h2>
      {exam.cards.map((c) => (
        <details key={c.id} className="mt-2 rounded border border-neutral-300 p-2">
          <summary>
            [{c.id}] ({c.type}) {c.front.slice(0, 110)}
          </summary>
          <pre className="mt-2 whitespace-pre-wrap">{c.back}</pre>
          <div className="mt-1 text-neutral-500">
            domain={c.domainId ?? "cross"} sources={c.sourceIds.join(", ")} {c.tag ? `tag=${c.tag}` : ""}
          </div>
        </details>
      ))}

      <h2 className="mt-6 text-lg font-bold">questions ({exam.questions.length})</h2>
      {exam.questions.map((q) => (
        <details key={q.id} className="mt-2 rounded border border-neutral-300 p-2">
          <summary>
            [{q.id}] {q.official ? "★OFFICIAL " : ""}
            {!q.distractorRationale ? "⚠incomplete-rationale " : ""}
            {q.question.slice(0, 110)}
          </summary>
          <ol className="mt-2 list-[upper-alpha] pl-6">
            {q.options.map((o, i) => (
              <li key={i} className={i === q.correctIndex ? "font-bold" : ""}>
                {o}
                {q.perOptionExplanations?.[String(i)] && (
                  <span className="text-neutral-500"> — {q.perOptionExplanations[String(i)]}</span>
                )}
              </li>
            ))}
          </ol>
          <pre className="mt-2 whitespace-pre-wrap">{q.explanation}</pre>
          {q.examTakeaway && <pre className="mt-1 whitespace-pre-wrap">💡 {q.examTakeaway}</pre>}
          <div className="mt-1 text-neutral-500">
            domain={q.domainId} sources={q.sourceIds.join(", ")} {q.scenario ? `scenario=${q.scenario}` : ""}
          </div>
        </details>
      ))}
    </main>
  );
}
