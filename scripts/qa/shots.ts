/**
 * A11 — the visual QA loop. `pnpm shots` runs the full sweep:
 * capture → in-page assertions (the actual gate) → baseline pixel diff.
 *
 * Determinism: the queue RNG is seeded (?qaseed=7), IndexedDB is preloaded
 * from generated fixtures, the clock is frozen at T0 via Playwright's fake
 * clock (no real Date.now() reaches the UI during capture), and animations
 * are disabled by injected CSS (a separate reduced-motion pass uses media
 * emulation instead).
 *
 * Exit: nonzero on any assertion failure in checks 1-7 and 9, or a baseline
 * diff without --update-baselines. Check 8 (contrast) is report-only until
 * Phase 5 brand colors land.
 *
 * Flags: --update-baselines   rewrite committed baselines
 *        --no-server          reuse an already-running server on :4799
 */
import { chromium, type BrowserContext, type Page } from "playwright";
import { spawn, type ChildProcess } from "node:child_process";
import { mkdirSync, writeFileSync, readFileSync, existsSync } from "node:fs";
import path from "node:path";
import { PNG } from "pngjs";
import pixelmatch from "pixelmatch";
import { getExamById } from "../../content/registry";
import { initialProgress, advanceState, DAY_MS, type CardProgress } from "../../lib/learning";
import { ASSERT_SOURCE } from "./assert-layout.mjs";

const ROOT = path.join(import.meta.dirname, "..", "..");
const OUT = path.join(import.meta.dirname, "out");
const FIXTURES = path.join(import.meta.dirname, "fixtures");
const BASELINES = path.join(import.meta.dirname, "baselines");
const PORT = 4799;
const BASE = `http://127.0.0.1:${PORT}`;
const SEED = 7;
const T0 = Date.parse("2026-09-05T12:00:00.000Z");
const UPDATE_BASELINES = process.argv.includes("--update-baselines");
const NO_SERVER = process.argv.includes("--no-server");

const ccaf = getExamById("cca-f")!;
const snowpro = getExamById("snowpro-c03")!;
const CCAF_SLUG = ccaf.manifest.slug;

/* ---------------- worst-case content (computed, never sampled) ---------------- */
const by = <T,>(xs: T[], f: (x: T) => number) => xs.reduce((a, b) => (f(b) > f(a) ? b : a));
const WORST = {
  question: by(ccaf.questions, (q) => q.question.length).id,
  options: by(ccaf.questions, (q) => q.options.join("").length).id,
  cardBack: by(ccaf.cards, (c) => c.back.length).id,
  scenario: by(ccaf.cards.filter((c) => c.type === "scenario"), (c) => c.front.length + c.back.length).id,
};
const firstOf = (type: string) => ccaf.cards.find((c) => c.type === type)!.id;
const PIN = {
  recall: firstOf("recall"),
  scenario: firstOf("scenario"),
  trap: firstOf("trap"),
  question: ccaf.questions[0].id,
  snowproRecall: snowpro.cards.find((c) => c.type === "recall")!.id,
};

/* ---------------- fixtures ---------------- */
interface FixtureRow extends Omit<CardProgress, "fsrs"> {
  fsrs: Record<string, unknown> & { due: string; last_review?: string };
}
const serialize = (p: CardProgress, dueOffsetDays: number): FixtureRow => ({
  ...p,
  fsrs: {
    ...(p.fsrs as unknown as Record<string, unknown>),
    due: new Date(T0 + dueOffsetDays * DAY_MS).toISOString(),
    last_review: new Date(T0 - DAY_MS).toISOString(),
  },
});
const settled = (id: string, domainId: string | null, dueOffsetDays: number) => {
  let p = initialProgress(id, "cca-f", domainId, T0 - 30 * DAY_MS);
  for (const n of [-20, -19, -18, -10, -5]) p = advanceState(p, true, T0 + n * DAY_MS);
  return serialize(p, dueOffsetDays);
};

function buildFixtures() {
  const baseSettings = { exams: {}, dailyReviewTarget: 40, retentionTarget: 0.9, reducedMotion: false };
  const dateSet = {
    ...baseSettings,
    exams: { "cca-f": { examDate: "2026-10-15", examDateSetAt: "2026-09-01" } },
  };
  const dueSoon = ccaf.cards.slice(0, 20).map((c) => settled(c.id, c.domainId, -1));
  const fixtures: Record<string, { settings: unknown; progress: FixtureRow[]; events: unknown[] }> = {
    fresh: { settings: baseSettings, progress: [], events: [] },
    dateset: { settings: dateSet, progress: [], events: [] },
    midsession: {
      settings: dateSet,
      progress: dueSoon,
      events: [
        { cardId: dueSoon[0].cardId, examId: "cca-f", domainId: dueSoon[0].domainId, at: T0 - DAY_MS, grade: "good", confidence: "certain", correct: false },
      ],
    },
    alldone: {
      settings: dateSet,
      progress: [
        ...ccaf.cards.map((c) => settled(c.id, c.domainId, +5)),
        ...ccaf.questions.map((q) => settled(q.id, q.domainId, +5)),
      ],
      events: [],
    },
  };
  mkdirSync(FIXTURES, { recursive: true });
  for (const [name, fx] of Object.entries(fixtures))
    writeFileSync(path.join(FIXTURES, `${name}.json`), JSON.stringify(fx, null, 1), "utf8");
  return fixtures;
}

/**
 * Runs in-page: replicate lib/storage/db.ts schema exactly and preload.
 * NOTE: passed to page.evaluate as a real function so Playwright serializes
 * AND INVOKES it. A string form ("(async fx => …)") evaluates to a function
 * object without calling it — that bug silently skipped every fixture in the
 * first sweeps (all --nobanner/midsession/empty-deck cells captured the
 * wrong state). It returns a marker that driveCell asserts on, so a future
 * regression fails loudly instead of lying.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const populateFixture = async (fx: any): Promise<string> => {
  const req = indexedDB.open("rapids-v1", 1);
  const db: IDBDatabase = await new Promise((resolve, reject) => {
    req.onupgradeneeded = () => {
      const d = req.result;
      const progress = d.createObjectStore("progress", { keyPath: "cardId" });
      progress.createIndex("byExam", "examId");
      const events = d.createObjectStore("events", { keyPath: "id", autoIncrement: true });
      events.createIndex("byExam", "examId");
      d.createObjectStore("sessions", { keyPath: "id", autoIncrement: true });
      d.createObjectStore("settings");
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
  const tx = db.transaction(["progress", "events", "settings"], "readwrite");
  for (const row of fx.progress) {
    row.fsrs.due = new Date(row.fsrs.due);
    if (row.fsrs.last_review) row.fsrs.last_review = new Date(row.fsrs.last_review);
    tx.objectStore("progress").put(row);
  }
  for (const e of fx.events) tx.objectStore("events").add(e);
  tx.objectStore("settings").put(fx.settings, "settings");
  await new Promise((resolve, reject) => {
    tx.oncomplete = () => resolve(null);
    tx.onerror = () => reject(tx.error);
  });
  db.close();
  return "populated";
};

/* ---------------- matrix ---------------- */
const VIEWPORTS = [
  { label: "phone-sm", width: 360, height: 640, phone: true },
  { label: "phone", width: 390, height: 844, phone: true },
  { label: "phone-landscape", width: 844, height: 390, phone: true },
  { label: "tablet", width: 768, height: 1024, phone: false },
  { label: "desktop", width: 1440, height: 900, phone: false },
  { label: "desktop-short", width: 1440, height: 720, phone: false },
  { label: "desktop-wide-short", width: 1790, height: 805, phone: false },
];

type Action =
  | { op: "arm-attempt" }
  | { op: "mc-pick"; index: number }
  | { op: "confidence" }
  | { op: "scroll-to"; slot: number }
  | { op: "skip-and-return" };

interface Cell {
  name: string;
  route: string;
  fixture: string;
  actions: Action[];
  feed?: boolean;
}

const feedUrl = (pin?: string, slug = CCAF_SLUG) =>
  `/exam/${slug}/feed?qaseed=${SEED}${pin ? `&qafirst=${pin}` : ""}`;

function buildCells(): Cell[] {
  const cells: Cell[] = [
    { name: "home", route: "/", fixture: "fresh", actions: [] },
    { name: "dump-ccaf", route: `/dump/${CCAF_SLUG}`, fixture: "fresh", actions: [] },
    { name: "dump-snowpro", route: `/dump/${snowpro.manifest.slug}`, fixture: "fresh", actions: [] },
  ];
  const feedStates: Array<{ n: string; pin?: string; a: Action[] }> = [
    { n: "recall-front", pin: PIN.recall, a: [] },
    { n: "recall-confidence", pin: PIN.recall, a: [{ op: "arm-attempt" }] },
    { n: "recall-back", pin: PIN.recall, a: [{ op: "arm-attempt" }, { op: "confidence" }] },
    { n: "scenario-front", pin: PIN.scenario, a: [] },
    { n: "scenario-back", pin: PIN.scenario, a: [{ op: "arm-attempt" }, { op: "confidence" }] },
    { n: "trap-front", pin: PIN.trap, a: [] },
    { n: "trap-back", pin: PIN.trap, a: [{ op: "arm-attempt" }, { op: "confidence" }] },
    { n: "examformat-unanswered", pin: PIN.question, a: [] },
    { n: "examformat-confidence", pin: PIN.question, a: [{ op: "mc-pick", index: 0 }] },
    { n: "examformat-revealed", pin: PIN.question, a: [{ op: "mc-pick", index: 0 }, { op: "confidence" }] },
    { n: "skipped-lapsed", pin: PIN.recall, a: [{ op: "skip-and-return" }] },
    { n: "checkpoint", a: [{ op: "scroll-to", slot: 12 }] },
    { n: "session-complete", a: [{ op: "scroll-to", slot: -1 }] },
    { n: "worst-question-front", pin: WORST.question, a: [] },
    { n: "worst-question-back", pin: WORST.question, a: [{ op: "mc-pick", index: 0 }, { op: "confidence" }] },
    { n: "worst-options-front", pin: WORST.options, a: [] },
    { n: "worst-options-back", pin: WORST.options, a: [{ op: "mc-pick", index: 0 }, { op: "confidence" }] },
    { n: "worst-cardback-back", pin: WORST.cardBack, a: [{ op: "arm-attempt" }, { op: "confidence" }] },
    { n: "worst-scenario-back", pin: WORST.scenario, a: [{ op: "arm-attempt" }, { op: "confidence" }] },
  ];
  for (const s of feedStates) {
    cells.push({ name: `feed-${s.n}--banner`, route: feedUrl(s.pin), fixture: "fresh", actions: s.a, feed: true });
    cells.push({ name: `feed-${s.n}--nobanner`, route: feedUrl(s.pin), fixture: "dateset", actions: s.a, feed: true });
  }
  cells.push({ name: "feed-empty-deck--nobanner", route: feedUrl(), fixture: "alldone", actions: [], feed: true });
  cells.push({ name: "feed-snowpro-front--banner", route: feedUrl(PIN.snowproRecall, snowpro.manifest.slug), fixture: "fresh", actions: [], feed: true });
  return cells;
}

/* ---------------- per-cell driver ---------------- */
const NO_ANIM_CSS = `*,*::before,*::after{transition-duration:0s!important;animation-duration:0s!important;scroll-behavior:auto!important}`;

async function driveCell(
  ctx: BrowserContext,
  cell: Cell,
  fixtures: Record<string, unknown>,
  phone: boolean,
  reducedMotion: boolean,
): Promise<{ failures: unknown[]; reports: unknown[]; page: Page }> {
  const page = await ctx.newPage();
  await page.clock.install({ time: T0 });
  await page.goto(`${BASE}/`, { waitUntil: "domcontentloaded" });
  const marker = await page.evaluate(populateFixture, fixtures[cell.fixture]);
  if (marker !== "populated") throw new Error(`fixture load failed for ${cell.fixture}`);
  await page.goto(`${BASE}${cell.route}`, { waitUntil: "networkidle" });
  if (!reducedMotion) await page.addStyleTag({ content: NO_ANIM_CSS });
  if (cell.feed) {
    await page.waitForSelector('[data-qa="feed-scroll"], [data-qa="summary"]', { timeout: 15000 });
    await page.clock.runFor(600); // first nowTick interval
  }
  for (const a of cell.actions) {
    if (a.op === "arm-attempt") {
      await page.clock.runFor(2600); // pass the 2s arming under the fake clock
      await page.click('[data-qa="recall-attempt"]');
    } else if (a.op === "mc-pick") {
      await page.click(`[data-qa="card-front-scroll"] button >> nth=${a.index}`);
    } else if (a.op === "confidence") {
      await page.click('[data-qa="confidence-row"] button >> nth=2');
      await page.clock.runFor(600);
    } else if (a.op === "scroll-to") {
      await page.evaluate((slot) => {
        const el = document.querySelector('[data-qa="feed-scroll"]') as HTMLElement;
        const n = slot === -1 ? el.querySelectorAll('[data-qa="slot"]').length - 1 : slot;
        el.scrollTop = n * el.clientHeight;
      }, a.slot);
      await page.clock.runFor(400);
      await page.waitForTimeout(150);
    } else if (a.op === "skip-and-return") {
      await page.evaluate(() => {
        const el = document.querySelector('[data-qa="feed-scroll"]') as HTMLElement;
        el.scrollTop = el.clientHeight;
      });
      await page.waitForTimeout(150);
      await page.evaluate(() => {
        (document.querySelector('[data-qa="feed-scroll"]') as HTMLElement).scrollTop = 0;
      });
      await page.waitForTimeout(150);
    }
    await page.clock.runFor(300);
  }
  await page.evaluate(`window.__QA_PHONE = ${phone}`);
  const result = (await page.evaluate(ASSERT_SOURCE)) as { failures: unknown[]; reports: unknown[] };
  return { ...result, page };
}

/* ---------------- baseline diff ---------------- */
function diffAgainstBaseline(name: string, shotPath: string): string | null {
  const basePath = path.join(BASELINES, `${name}.png`);
  if (!existsSync(basePath)) return null;
  const a = PNG.sync.read(readFileSync(basePath));
  const b = PNG.sync.read(readFileSync(shotPath));
  if (a.width !== b.width || a.height !== b.height)
    return `size changed ${a.width}x${a.height} → ${b.width}x${b.height}`;
  const diff = new PNG({ width: a.width, height: a.height });
  const n = pixelmatch(a.data, b.data, diff.data, a.width, a.height, { threshold: 0.15 });
  const pct = (n / (a.width * a.height)) * 100;
  if (pct > 0.5) {
    writeFileSync(path.join(OUT, `DIFF-${name}.png`), PNG.sync.write(diff));
    return `${pct.toFixed(2)}% pixels differ`;
  }
  return null;
}

/* ---------------- main ---------------- */
async function main() {
  mkdirSync(OUT, { recursive: true });
  mkdirSync(BASELINES, { recursive: true });
  const fixtures = buildFixtures();
  const cells = buildCells();

  let server: ChildProcess | null = null;
  if (!NO_SERVER) {
    server = spawn("node", [path.join(ROOT, "node_modules", "next", "dist", "bin", "next"), "start", "-p", String(PORT)], {
      cwd: ROOT,
      stdio: "ignore",
    });
    for (let i = 0; i < 60; i++) {
      try {
        const r = await fetch(BASE);
        if (r.ok) break;
      } catch {
        await new Promise((r) => setTimeout(r, 500));
      }
      if (i === 59) throw new Error("server never became ready");
    }
  }

  const browser = await chromium.launch();
  const allFailures: Record<string, unknown[]> = {};
  const allReports: Record<string, unknown[]> = {};
  const diffs: Record<string, string> = {};
  let captured = 0;

  // Reduced-motion pass: representative interactive cells at two viewports.
  const rmCells = new Set(["feed-recall-front--banner", "feed-recall-back--banner", "feed-examformat-unanswered--banner", "feed-examformat-revealed--banner"]);
  const rmViewports = new Set(["phone", "desktop-wide-short"]);

  const jobs: Array<{ vp: (typeof VIEWPORTS)[number]; cell: Cell; rm: boolean }> = [];
  for (const vp of VIEWPORTS) for (const cell of cells) jobs.push({ vp, cell, rm: false });
  for (const vp of VIEWPORTS.filter((v) => rmViewports.has(v.label)))
    for (const cell of cells.filter((c) => rmCells.has(c.name))) jobs.push({ vp, cell, rm: true });

  const WORKERS = 4;
  let next = 0;
  await Promise.all(
    Array.from({ length: WORKERS }, async () => {
      while (next < jobs.length) {
        const job = jobs[next++];
        const { vp, cell, rm } = job;
        const key = `${vp.label}/${cell.name}${rm ? "--rm" : ""}`;
        const ctx = await browser.newContext({
          viewport: { width: vp.width, height: vp.height },
          deviceScaleFactor: 1,
          reducedMotion: rm ? "reduce" : "no-preference",
          colorScheme: "dark",
        });
        try {
          const { failures, reports, page } = await driveCell(ctx, cell, fixtures, vp.phone, rm);
          const dir = path.join(OUT, vp.label);
          mkdirSync(dir, { recursive: true });
          const shotPath = path.join(dir, `${cell.name}${rm ? "--rm" : ""}.png`);
          await page.screenshot({ path: shotPath });
          captured++;
          if (failures.length) allFailures[key] = failures;
          if (reports.length) allReports[key] = reports;
          const baselineName = `${vp.label}--${cell.name}${rm ? "--rm" : ""}`;
          if (UPDATE_BASELINES && existsSync(path.join(BASELINES, `${baselineName}.png`))) {
            writeFileSync(path.join(BASELINES, `${baselineName}.png`), readFileSync(shotPath));
          } else {
            const d = diffAgainstBaseline(baselineName, shotPath);
            if (d) diffs[key] = d;
          }
        } catch (err) {
          allFailures[key] = [{ check: 0, what: "CAPTURE ERROR", selector: cell.route, values: String(err) }];
        } finally {
          await ctx.close();
        }
      }
    }),
  );

  await browser.close();
  server?.kill();

  writeFileSync(
    path.join(OUT, "assert-results.json"),
    JSON.stringify({ captured, failures: allFailures, contrastReports: allReports, diffs }, null, 1),
    "utf8",
  );

  console.log(`captured ${captured} screenshots across ${VIEWPORTS.length} viewports`);
  const failCells = Object.keys(allFailures);
  if (Object.keys(allReports).length)
    console.log(`contrast (report-only until Phase 5): ${Object.keys(allReports).length} cells with findings — see assert-results.json`);
  if (Object.keys(diffs).length) {
    console.error(`BASELINE DIFFS (${Object.keys(diffs).length}):`);
    for (const [k, v] of Object.entries(diffs)) console.error(`  ${k}: ${v}`);
  }
  if (failCells.length) {
    console.error(`\nASSERTION FAILURES in ${failCells.length} cells:`);
    for (const k of failCells) {
      for (const f of allFailures[k] as { check: number; what: string; selector: string; values: string }[])
        console.error(`  [${k}] check ${f.check} ${f.what} :: ${f.selector} :: ${f.values}`);
    }
  }
  if (failCells.length || Object.keys(diffs).length) process.exit(1);
  console.log("all layout assertions passed; no baseline drift");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
