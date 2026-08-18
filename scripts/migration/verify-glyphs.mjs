/**
 * Glyph-polarity verification for the 36 cards migrated from the
 * hand-delivered CCA_TikTok_Flashcards.jsx (Phase 1 sign-off condition,
 * Jake 2026-08-17). The file arrived encoding-mangled; ✅/❌/→ were restored
 * by context. A single inverted ✅/❌ would produce a card that fluently
 * teaches the opposite of the correct answer — the failure mode least
 * likely to be caught by reading. So: structural assertions, not skimming.
 *
 * SCENARIO cards (normal polarity — back leads with the correct approach):
 *   S1 exactly one ✅ block
 *   S2 the ✅ block precedes all ❌ blocks
 *   S3 at least one ❌ block
 *   S4 no ❌ inside the ✅ block's text span (✅ line through next blank line)
 *
 * TRAP cards (inverted polarity — front states the wrong approach):
 *   T1 back OPENS with ❌ (the trap is refuted first)
 *   T2 no ✅ appears before the first ❌
 *   T3 exactly one ✅ block after the ❌ opening — or zero, which is FLAGGED
 *      for manual review rather than failed (a trap back may present the
 *      correct alternative without a glyph, faithful to source).
 *
 * Exit code 1 on any hard failure; flags are listed for manual confirmation.
 */
import { readFileSync } from "node:fs";
import path from "node:path";

const file = path.join(import.meta.dirname, "..", "..", "content", "exams", "cca-f", "cards.ts");
const src = readFileSync(file, "utf8");
const cards = JSON.parse(src.slice(src.indexOf("= [") + 2, src.lastIndexOf(";")));

const CHECK = "✅"; // ✅
const CROSS = "❌"; // ❌

const failures = [];
const flags = [];
let scenarioCount = 0;
let trapCount = 0;

for (const c of cards) {
  if (c.type === "scenario") {
    scenarioCount++;
    const checks = [...c.back.matchAll(new RegExp(CHECK, "g"))].map((m) => m.index);
    const crosses = [...c.back.matchAll(new RegExp(CROSS, "g"))].map((m) => m.index);

    if (checks.length !== 1) failures.push(`${c.id} S1: expected exactly one ${CHECK}, found ${checks.length}`);
    if (crosses.length < 1) failures.push(`${c.id} S3: no ${CROSS} block found`);
    if (checks.length && crosses.length && !crosses.every((x) => x > checks[0]))
      failures.push(`${c.id} S2: a ${CROSS} precedes the ${CHECK} block`);
    if (checks.length === 1) {
      const blockEnd = c.back.indexOf("\n\n", checks[0]);
      const span = c.back.slice(checks[0], blockEnd === -1 ? undefined : blockEnd);
      if (span.includes(CROSS)) failures.push(`${c.id} S4: ${CROSS} inside the ${CHECK} block span`);
    }
  } else if (c.type === "trap") {
    trapCount++;
    const firstGlyphLine = c.back.trimStart();
    const checks = [...c.back.matchAll(new RegExp(CHECK, "g"))].map((m) => m.index);
    const firstCross = c.back.indexOf(CROSS);

    if (!firstGlyphLine.startsWith(CROSS)) failures.push(`${c.id} T1: back does not open with ${CROSS}`);
    if (firstCross === -1) failures.push(`${c.id} T1: no ${CROSS} at all`);
    if (checks.some((x) => x < firstCross)) failures.push(`${c.id} T2: ${CHECK} appears before the first ${CROSS}`);
    if (checks.length === 0)
      flags.push(`${c.id} T3-FLAG: no ${CHECK} block — correct alternative presented without glyph; manual review required`);
    else if (checks.length > 1) failures.push(`${c.id} T3: ${checks.length} ${CHECK} blocks, expected one`);
  }
}

console.log(`scenario cards checked: ${scenarioCount} (expect 23)`);
console.log(`trap cards checked:     ${trapCount} (expect 13)`);
if (scenarioCount !== 23 || trapCount !== 13) {
  failures.push(`card counts wrong: scenario=${scenarioCount} trap=${trapCount}`);
}

if (flags.length) {
  console.log(`\nFLAGGED for manual review (${flags.length}):`);
  for (const f of flags) console.log(`  ${f}`);
}
if (failures.length) {
  console.error(`\nFAILURES (${failures.length}):`);
  for (const f of failures) console.error(`  ${f}`);
  process.exit(1);
}
console.log(`\nAll structural glyph assertions passed (${flags.length} flag(s) need manual confirmation).`);
