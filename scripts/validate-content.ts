/**
 * Build-time content validation (`pnpm validate:content`). Wired into the
 * Vercel build: the deploy fails on broken source IDs, weights that do not
 * sum to 100, cards referencing nonexistent domains, duplicate IDs, or
 * missing required fields.
 *
 * Prints composition (counts by type and domain), never a bare total —
 * a bare number cannot distinguish "nothing changed" from "one added, one
 * silently uncollected".
 */
import { EXAMS } from "../content/registry";
import { validateExam } from "../content/schema";

let failed = false;
const examIds = new Set<string>();
const slugs = new Set<string>();

for (const exam of EXAMS) {
  const { id, slug } = exam.manifest;
  if (examIds.has(id)) { console.error(`duplicate exam id: ${id}`); failed = true; }
  if (slugs.has(slug)) { console.error(`duplicate exam slug: ${slug}`); failed = true; }
  examIds.add(id); slugs.add(slug);

  const problems = validateExam(exam);
  const byType = exam.cards.reduce<Record<string, number>>((m, c) => ((m[c.type] = (m[c.type] ?? 0) + 1), m), {});
  const qByDomain = exam.questions.reduce<Record<string, number>>((m, q) => ((m[q.domainId] = (m[q.domainId] ?? 0) + 1), m), {});
  const official = exam.questions.filter((q) => q.official).length;
  const noRationale = exam.questions.filter((q) => !q.distractorRationale).length;

  console.log(
    `${id}: sections=${exam.sections.length} cards=${exam.cards.length} ${JSON.stringify(byType)} ` +
      `questions=${exam.questions.length} ${JSON.stringify(qByDomain)} official=${official} ` +
      `missing-distractor-rationale=${noRationale} sources=${exam.sources.length} ` +
      `weightsVerified=${exam.manifest.weightsVerified}`,
  );

  if (problems.length) {
    failed = true;
    console.error(`\n${id}: ${problems.length} problem(s):`);
    for (const p of problems) console.error(`  - ${p}`);
  }
}

if (failed) {
  console.error("\ncontent validation FAILED");
  process.exit(1);
}
console.log("\ncontent validation passed");
