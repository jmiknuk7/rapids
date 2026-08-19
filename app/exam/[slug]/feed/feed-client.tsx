"use client";

/**
 * The Feed — Rapids' primary study surface. It RENDERS buildQueue() output;
 * queue composition lives in the engine (lib/learning/queue.ts), never here.
 *
 * Interaction contract (Phase 3 pre-brief):
 * - forced attempt before reveal (MC pick, or "I've recalled it" armed at 2s)
 * - confidence BEFORE reveal, grade after, both rows in the same bottom-third
 *   position so the thumb never travels
 * - skipping past an attempted-but-ungraded card records a lapse (confidence
 *   null — never fabricated)
 * - fixed-height slots for every queue position: scrollHeight never changes,
 *   so scroll-snap and virtualization cannot fight (render window ±2)
 * - median time-per-card instrumented and reported in the session summary
 */

import { useCallback, useEffect, useMemo, useRef, useState, useSyncExternalStore } from "react";
import Link from "next/link";
import { EXAMS, getExamBySlug } from "../../../../content/registry";
import type { Card, ExamContent, Question } from "../../../../content/schema";
import {
  advanceState,
  buildQueue,
  clampInterval,
  initialProgress,
  makeScheduler,
  isoDay,
  DAY_MS,
  type CardProgress,
  type Confidence,
  type QueueItem,
  type ReviewGrade,
} from "../../../../lib/learning";
import { mulberry32 } from "../../../../lib/learning/rng";
import { CARD_STATE_ORDER } from "../../../../lib/learning/types";
import {
  addSession,
  appendEvent,
  loadBlindSpots,
  loadProgress,
  loadSettings,
  saveProgress,
  saveSettings,
} from "../../../../lib/storage/db";
import type { Settings } from "../../../../lib/settings/schema";

const REASON_LABEL: Record<QueueItem["reason"], string> = {
  "blind-spot": "blind spot",
  "at-risk": "at risk",
  due: "due",
  new: "new",
};
const REASON_STYLE: Record<QueueItem["reason"], string> = {
  "blind-spot": "bg-red-500/20 text-red-300 border-red-500/40",
  "at-risk": "bg-amber-500/20 text-amber-300 border-amber-500/40",
  due: "bg-sky-500/20 text-sky-300 border-sky-500/40",
  new: "bg-emerald-500/20 text-emerald-300 border-emerald-500/40",
};
const TYPE_LABEL: Record<string, string> = {
  recall: "free recall",
  scenario: "scenario",
  trap: "trap",
  question: "exam format",
};
const CONFIDENCES: Confidence[] = ["guess", "unsure", "confident", "certain"];
const GRADES: ReviewGrade[] = ["again", "hard", "good", "easy"];
const REVEAL_ARM_MS = 2000;
const CHECKPOINT_EVERY = 12;

type Slot =
  | { type: "item"; item: QueueItem }
  | { type: "checkpoint"; ordinal: number }
  | { type: "summary" };

interface SlotState {
  attempted?: { mcPick?: number; at: number };
  confidence?: Confidence;
  revealed?: boolean;
  graded?: boolean;
  correct?: boolean;
  skipped?: boolean;
  durationMs?: number;
}

interface SessionStats {
  answered: number;
  correct: number;
  lapses: number;
  skipped: number;
  promotions: number;
  streak: number;
  times: number[];
  attempts: { domainId: string | null; confidence: Confidence; correct: boolean }[];
  byDomain: Record<string, { seen: number; correct: number }>;
}

const freshStats = (): SessionStats => ({
  answered: 0,
  correct: 0,
  lapses: 0,
  skipped: 0,
  promotions: 0,
  streak: 0,
  times: [],
  attempts: [],
  byDomain: {},
});

const median = (xs: number[]): number | null => {
  if (!xs.length) return null;
  const s = [...xs].sort((a, b) => a - b);
  const m = Math.floor(s.length / 2);
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
};

export default function FeedClient({ slug }: { slug: string }) {
  const exam = getExamBySlug(slug)!;
  const accent = exam.manifest.accent;
  const cardsById = useMemo(() => new Map(exam.cards.map((c) => [c.id, c])), [exam]);
  const questionsById = useMemo(() => new Map(exam.questions.map((q) => [q.id, q])), [exam]);
  const domainsById = useMemo(
    () => new Map(exam.manifest.domains.map((d) => [d.id, d])),
    [exam],
  );
  const otherExams = EXAMS.filter((e) => e.manifest.slug !== slug);

  const [loading, setLoading] = useState(true);
  const [settings, setSettings] = useState<Settings | null>(null);
  const [slots, setSlots] = useState<Slot[]>([]);
  const [slotStates, setSlotStates] = useState<Record<number, SlotState>>({});
  const [activeIdx, setActiveIdx] = useState(0);
  const [stats, setStats] = useState<SessionStats>(freshStats());
  const [domainFilter, setDomainFilter] = useState<string | null>(null);
  // Clock state, updated by an interval (never Date.now() during render):
  // drives the 2-second reveal arming.
  const [nowTick, setNowTick] = useState(0);
  const [dateDraft, setDateDraft] = useState("");

  const reducedMotion = useSyncExternalStore(
    (cb) => {
      const mq = window.matchMedia("(prefers-reduced-motion: reduce)");
      mq.addEventListener("change", cb);
      return () => mq.removeEventListener("change", cb);
    },
    () => window.matchMedia("(prefers-reduced-motion: reduce)").matches,
    () => false,
  );

  const progressRef = useRef<Map<string, CardProgress>>(new Map());
  const containerRef = useRef<HTMLDivElement>(null);
  const startedAtRef = useRef(0);
  const summarySavedRef = useRef(false);
  const skipRecordedRef = useRef<Set<number>>(new Set());
  /** First-shown timestamps per slot index (event-time, not render-time). */
  const shownAtRef = useRef<Map<number, number>>(new Map());
  const scheduler = useMemo(
    () => makeScheduler(settings?.retentionTarget ?? 0.9),
    [settings?.retentionTarget],
  );

  const examSettings = settings?.exams[exam.manifest.id];
  const examDate = examSettings?.examDate ?? null;

  /* ---------- init ---------- */
  useEffect(() => {
    let cancelled = false;
    (async () => {
      const [s, progress, blindSpots] = await Promise.all([
        loadSettings(),
        loadProgress(exam.manifest.id),
        loadBlindSpots(exam.manifest.id),
      ]);
      if (cancelled) return;
      progressRef.current = progress;
      const now = Date.now();
      startedAtRef.current = now;
      const es = s.exams[exam.manifest.id];
      const queue = buildQueue({
        exam,
        progress,
        blindSpots,
        examDate: es?.examDate ?? null,
        examDateSetAt: es?.examDateSetAt ?? null,
        sessionSize: s.dailyReviewTarget,
        now,
        rng: mulberry32(now % 2 ** 31),
      });
      const built: Slot[] = [];
      queue.forEach((item, i) => {
        built.push({ type: "item", item });
        if ((i + 1) % CHECKPOINT_EVERY === 0 && i + 1 < queue.length)
          built.push({ type: "checkpoint", ordinal: (i + 1) / CHECKPOINT_EVERY });
      });
      built.push({ type: "summary" });
      shownAtRef.current.set(0, Date.now());
      setSettings(s);
      setSlots(built);
      setNowTick(Date.now());
      setLoading(false);
    })();
    return () => {
      cancelled = true;
    };
  }, [exam]);

  /* ---------- visible slots under the domain filter ---------- */
  const visibleSlots = useMemo(() => {
    if (!domainFilter) return slots;
    return slots.filter(
      (s) => s.type !== "item" || s.item.domainId === domainFilter,
    );
  }, [slots, domainFilter]);

  /* ---------- 2s reveal arming tick ---------- */
  useEffect(() => {
    const t = setInterval(() => setNowTick(Date.now()), 250);
    return () => clearInterval(t);
  }, []);

  /* ---------- scroll → active slot + skip-as-lapse ---------- */
  const recordSkip = useCallback(
    (idx: number) => {
      const slot = visibleSlots[idx];
      if (!slot || slot.type !== "item") return;
      const st = slotStates[idx] ?? {};
      // The ref guards against double-recording when several scroll events
      // land before React re-renders slotStates.
      if (st.graded || st.skipped || !shownAtRef.current.has(idx) || skipRecordedRef.current.has(idx))
        return;
      skipRecordedRef.current.add(idx);
      setSlotStates((prev) => ({ ...prev, [idx]: { ...(prev[idx] ?? {}), skipped: true } }));
      applyResult(slot.item, false, "again", null, Date.now(), true);
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [visibleSlots, slotStates],
  );

  const onScroll = useCallback(() => {
    const el = containerRef.current;
    if (!el || !el.clientHeight) return;
    const idx = Math.round(el.scrollTop / el.clientHeight);
    if (!shownAtRef.current.has(idx)) shownAtRef.current.set(idx, Date.now());
    setActiveIdx((prev) => {
      if (idx > prev) for (let i = prev; i < idx; i++) recordSkip(i);
      return idx;
    });
  }, [recordSkip]);

  /* ---------- core recording ---------- */
  function applyResult(
    item: QueueItem,
    correct: boolean,
    grade: ReviewGrade,
    confidence: Confidence | null,
    now: number,
    skipped = false,
  ) {
    const prev =
      progressRef.current.get(item.id) ??
      initialProgress(item.id, exam.manifest.id, item.domainId, now);
    const advanced = advanceState(prev, correct, now);
    const { card, intervalDays } = scheduler.review(prev.fsrs, grade, now);
    const clamped = clampInterval(intervalDays, now, examDate);
    const due = new Date(now + clamped * DAY_MS);
    const next: CardProgress = { ...advanced, fsrs: { ...card, due } };
    progressRef.current.set(item.id, next);
    void saveProgress(next);
    void appendEvent({
      cardId: item.id,
      examId: exam.manifest.id,
      domainId: item.domainId,
      at: now,
      grade,
      confidence,
      correct,
      ...(skipped ? { skipped: true } : {}),
    });
    const promoted =
      CARD_STATE_ORDER.indexOf(next.state) > CARD_STATE_ORDER.indexOf(prev.state) && correct;
    setStats((s) => {
      const dom = item.domainId ?? "cross";
      const byDomain = {
        ...s.byDomain,
        [dom]: {
          seen: (s.byDomain[dom]?.seen ?? 0) + 1,
          correct: (s.byDomain[dom]?.correct ?? 0) + (correct ? 1 : 0),
        },
      };
      return {
        ...s,
        answered: s.answered + 1,
        correct: s.correct + (correct ? 1 : 0),
        lapses: s.lapses + (correct ? 0 : 1),
        skipped: s.skipped + (skipped ? 1 : 0),
        promotions: s.promotions + (promoted ? 1 : 0),
        streak: correct ? s.streak + 1 : 0,
        times: s.times,
        attempts: confidence
          ? [...s.attempts, { domainId: item.domainId, confidence, correct }]
          : s.attempts,
        byDomain,
      };
    });
    if (typeof navigator !== "undefined") navigator.vibrate?.(correct ? 8 : [20, 30, 20]);
  }

  const advanceTo = useCallback((idx: number) => {
    const el = containerRef.current;
    if (!el) return;
    el.scrollTo({ top: idx * el.clientHeight, behavior: "smooth" });
  }, []);

  /* ---------- per-slot interaction handlers ---------- */
  const setSlot = (idx: number, patch: Partial<SlotState>) =>
    setSlotStates((prev) => ({ ...prev, [idx]: { ...(prev[idx] ?? {}), ...patch } }));

  function onAttempt(idx: number, mcPick?: number) {
    const st = slotStates[idx] ?? {};
    if (st.attempted || st.graded) return;
    setSlot(idx, { attempted: { mcPick, at: Date.now() } });
  }

  function onConfidence(idx: number, c: Confidence) {
    const st = slotStates[idx] ?? {};
    if (!st.attempted || st.confidence || st.graded) return;
    setSlot(idx, { confidence: c, revealed: true });
  }

  function onGrade(idx: number, item: QueueItem, grade: ReviewGrade) {
    const st = slotStates[idx] ?? {};
    if (!st.revealed || st.graded) return;
    const now = Date.now();
    const q = item.kind === "question" ? questionsById.get(item.id) : undefined;
    const correct = q ? st.attempted?.mcPick === q.correctIndex : grade !== "again";
    const shownAt = shownAtRef.current.get(idx);
    const durationMs = shownAt ? now - shownAt : 0;
    setSlot(idx, { graded: true, correct, durationMs });
    setStats((s) => ({ ...s, times: [...s.times, durationMs] }));
    applyResult(item, correct, grade, st.confidence ?? null, now);
    window.setTimeout(() => advanceTo(idx + 1), 350);
  }

  /* ---------- keyboard ---------- */
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement) return;
      const idx = activeIdx;
      const slot = visibleSlots[idx];
      if (e.key === "ArrowDown") {
        e.preventDefault();
        advanceTo(idx + 1);
        return;
      }
      if (e.key === "ArrowUp") {
        e.preventDefault();
        advanceTo(Math.max(0, idx - 1));
        return;
      }
      if (!slot || slot.type !== "item") return;
      const st = slotStates[idx] ?? {};
      const item = slot.item;
      const isQuestion = item.kind === "question";
      if (e.key === " " && !isQuestion && !st.attempted) {
        e.preventDefault();
        const shownAt = shownAtRef.current.get(idx);
        if (shownAt && Date.now() - shownAt >= REVEAL_ARM_MS) onAttempt(idx);
        return;
      }
      const n = Number(e.key);
      if (n >= 1 && n <= 4) {
        e.preventDefault();
        if (!st.attempted && isQuestion) onAttempt(idx, n - 1);
        else if (st.attempted && !st.confidence) onConfidence(idx, CONFIDENCES[n - 1]);
        else if (st.revealed && !st.graded) onGrade(idx, item, GRADES[n - 1]);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeIdx, visibleSlots, slotStates]);

  /* ---------- session summary persistence ---------- */
  const sessionGap = useMemo(() => {
    if (!stats.attempts.length) return null;
    const CONF = { guess: 0.25, unsure: 0.5, confident: 0.75, certain: 0.95 } as const;
    const stated = stats.attempts.reduce((a, x) => a + CONF[x.confidence], 0) / stats.attempts.length;
    const acc = stats.attempts.filter((x) => x.correct).length / stats.attempts.length;
    return stated - acc;
  }, [stats.attempts]);

  const weakestDomain = useMemo(() => {
    const entries = Object.entries(stats.byDomain).filter(([k]) => k !== "cross");
    if (!entries.length) return null;
    return entries.reduce((w, e) =>
      e[1].correct / e[1].seen < w[1].correct / w[1].seen ? e : w,
    )[0];
  }, [stats.byDomain]);

  useEffect(() => {
    const summaryIdx = visibleSlots.findIndex((s) => s.type === "summary");
    if (summaryIdx !== -1 && activeIdx === summaryIdx && !summarySavedRef.current && stats.answered > 0) {
      summarySavedRef.current = true;
      void addSession({
        examId: exam.manifest.id,
        startedAt: startedAtRef.current,
        endedAt: Date.now(),
        answered: stats.answered,
        correct: stats.correct,
        lapses: stats.lapses,
        skipped: stats.skipped,
        promotions: stats.promotions,
        calibrationGap: sessionGap,
        medianMsPerCard: median(stats.times),
        weakestDomainId: weakestDomain,
      });
    }
  }, [activeIdx, visibleSlots, stats, sessionGap, weakestDomain, exam.manifest.id]);

  async function saveExamDate() {
    if (!settings || !/^\d{4}-\d{2}-\d{2}$/.test(dateDraft)) return;
    const next: Settings = {
      ...settings,
      exams: {
        ...settings.exams,
        [exam.manifest.id]: { examDate: dateDraft, examDateSetAt: isoDay(Date.now()) },
      },
    };
    setSettings(next);
    await saveSettings(next);
  }

  /* ---------- render ---------- */
  if (loading)
    return (
      <div className="flex h-dvh items-center justify-center bg-[#0B1017] text-neutral-500">
        Building your queue…
      </div>
    );

  const total = visibleSlots.filter((s) => s.type === "item").length;
  const flipStyle = (revealed: boolean) =>
    reducedMotion
      ? {}
      : {
          transformStyle: "preserve-3d" as const,
          transition: "transform 450ms cubic-bezier(0.4, 0, 0.2, 1)",
          transform: revealed ? "rotateY(180deg)" : "rotateY(0deg)",
        };

  return (
    <div className="bg-[#0B1017] text-neutral-100">
      {/* ── fixed HUD ── */}
      <div className="pointer-events-none fixed inset-x-0 top-0 z-40 bg-gradient-to-b from-[#0B1017] via-[#0B1017]/90 to-transparent pb-6">
        <div className="pointer-events-auto flex items-center gap-3 px-4 pt-3 text-xs">
          <span className="font-bold" style={{ color: accent }}>
            {exam.manifest.shortName}
          </span>
          <span aria-label={`streak ${stats.streak}`} className="text-amber-400">
            🔥 {stats.streak}
          </span>
          <span className="text-neutral-400">
            {stats.answered}/{total}
          </span>
          <div className="ml-auto flex gap-2">
            {otherExams.map((e) => (
              <Link
                key={e.manifest.id}
                href={`/exam/${e.manifest.slug}/feed`}
                className="rounded-full border border-neutral-700 px-2 py-1 text-neutral-400"
              >
                → {e.manifest.shortName}
              </Link>
            ))}
          </div>
        </div>
        <div className="pointer-events-auto mt-2 flex gap-1.5 overflow-x-auto px-4 [scrollbar-width:none]">
          <button
            onClick={() => setDomainFilter(null)}
            className={`shrink-0 rounded-full border px-2.5 py-1 text-[11px] ${!domainFilter ? "border-neutral-400 text-neutral-100" : "border-neutral-700 text-neutral-500"}`}
          >
            All
          </button>
          {exam.manifest.domains.map((d) => (
            <button
              key={d.id}
              onClick={() => setDomainFilter(domainFilter === d.id ? null : d.id)}
              className={`shrink-0 rounded-full border px-2.5 py-1 text-[11px] ${domainFilter === d.id ? "text-white" : "border-neutral-700 text-neutral-500"}`}
              style={domainFilter === d.id ? { backgroundColor: d.color, borderColor: d.color } : {}}
            >
              {d.short}
            </button>
          ))}
        </div>
        {examDate === null && (
          <div className="pointer-events-auto mx-4 mt-2 flex items-center gap-2 rounded-lg border border-amber-600/50 bg-amber-950/70 px-3 py-2 text-[11px] text-amber-200">
            <span className="min-w-0 flex-1">
              ⚠ No exam date set — deadline scheduling is INACTIVE. You are studying on an
              infinite horizon.
            </span>
            <input
              type="date"
              value={dateDraft}
              onChange={(e) => setDateDraft(e.target.value)}
              className="rounded border border-amber-700 bg-transparent px-1 py-0.5 text-amber-100"
              aria-label="Exam date"
            />
            <button
              onClick={() => void saveExamDate()}
              className="rounded bg-amber-600 px-2 py-1 font-bold text-black"
            >
              Set
            </button>
          </div>
        )}
      </div>

      {/* ── snap feed: every slot rendered at fixed height, content windowed ── */}
      <div
        ref={containerRef}
        onScroll={onScroll}
        className="h-dvh snap-y snap-mandatory overflow-y-scroll overscroll-none [scrollbar-width:none]"
      >
        {visibleSlots.map((slot, idx) => {
          const inWindow = Math.abs(idx - activeIdx) <= 2;
          return (
            <section
              key={idx}
              className="h-dvh snap-start [scroll-snap-stop:always]"
              aria-hidden={idx !== activeIdx}
            >
              {inWindow && slot.type === "item" && (
                <ItemSlot
                  idx={idx}
                  item={slot.item}
                  card={cardsById.get(slot.item.id)}
                  question={questionsById.get(slot.item.id)}
                  domainName={
                    slot.item.domainId
                      ? (domainsById.get(slot.item.domainId)?.name ?? slot.item.domainId)
                      : "Cross-domain"
                  }
                  accent={accent}
                  st={slotStates[idx] ?? {}}
                  active={idx === activeIdx}
                  shownAt={shownAtRef.current.get(idx)}
                  now={nowTick}
                  reducedMotion={reducedMotion}
                  flipStyle={flipStyle}
                  onAttempt={onAttempt}
                  onConfidence={onConfidence}
                  onGrade={onGrade}
                />
              )}
              {inWindow && slot.type === "checkpoint" && (
                <CheckpointSlot exam={exam} stats={stats} sessionGap={sessionGap} progress={progressRef.current} />
              )}
              {inWindow && slot.type === "summary" && (
                <SummarySlot
                  stats={stats}
                  sessionGap={sessionGap}
                  weakestDomain={weakestDomain ? (domainsById.get(weakestDomain)?.name ?? weakestDomain) : null}
                  medianMs={median(stats.times)}
                  slug={slug}
                />
              )}
            </section>
          );
        })}
      </div>
    </div>
  );
}

/* ================= item slot ================= */

function ItemSlot(props: {
  idx: number;
  item: QueueItem;
  card?: Card;
  question?: Question;
  domainName: string;
  accent: string;
  st: SlotState;
  active: boolean;
  shownAt: number | undefined;
  now: number;
  reducedMotion: boolean;
  flipStyle: (revealed: boolean) => React.CSSProperties;
  onAttempt: (idx: number, mcPick?: number) => void;
  onConfidence: (idx: number, c: Confidence) => void;
  onGrade: (idx: number, item: QueueItem, g: ReviewGrade) => void;
}) {
  const { idx, item, card, question, domainName, st, active } = props;
  const revealed = !!st.revealed;
  const isQuestion = item.kind === "question";
  const armed = !!props.shownAt && props.now - props.shownAt >= REVEAL_ARM_MS;
  const typeLabel = isQuestion ? TYPE_LABEL.question : TYPE_LABEL[card?.type ?? "recall"];
  const front = isQuestion ? question?.question : card?.front;
  const mcWrong = isQuestion && st.attempted?.mcPick !== question?.correctIndex;

  return (
    <div className="mx-auto flex h-full max-w-xl flex-col px-4 pb-44 pt-32">
      {/* meta row */}
      <div className="mb-3 flex flex-wrap items-center gap-2 text-[10px] uppercase tracking-wider">
        <span className="text-neutral-500">{domainName}</span>
        <span className="rounded-full border border-neutral-700 px-2 py-0.5 text-neutral-400">
          {typeLabel}
        </span>
        <span
          className="rounded-full border border-neutral-800 px-2 py-0.5 text-neutral-500"
          title="Diátaxis mode (A10)"
        >
          {item.mode}
        </span>
        <span
          className={`rounded-full border px-2 py-0.5 ${REASON_STYLE[item.reason]}`}
          title="Why this card was selected"
        >
          {REASON_LABEL[item.reason]}
        </span>
        {st.skipped && <span className="text-red-400">skipped — counted as a lapse</span>}
      </div>

      {/* flip container */}
      <div className="relative min-h-0 flex-1" style={{ perspective: 1400 }}>
        <div className="relative h-full w-full" style={props.flipStyle(revealed)}>
          {/* FRONT */}
          <div
            className={`absolute inset-0 flex flex-col overflow-hidden rounded-2xl border border-neutral-800 bg-[#101722] p-5 ${props.reducedMotion ? (revealed ? "hidden" : "") : "[backface-visibility:hidden]"}`}
            aria-hidden={revealed}
          >
            <p className="text-lg font-semibold leading-relaxed">{front}</p>
            {isQuestion && question && (
              <div className="mt-4 space-y-2 overflow-y-auto overscroll-contain">
                {question.options.map((o, i) => (
                  <button
                    key={i}
                    onClick={() => props.onAttempt(idx, i)}
                    disabled={!!st.attempted}
                    className={`w-full rounded-xl border p-3 text-left text-sm ${st.attempted?.mcPick === i ? "border-neutral-300 bg-neutral-800" : "border-neutral-700 bg-neutral-900/60"}`}
                  >
                    <span className="mr-2 font-bold text-neutral-500">
                      {String.fromCharCode(65 + i)}
                    </span>
                    {o}
                  </button>
                ))}
              </div>
            )}
            {!isQuestion && !st.attempted && (
              <button
                onClick={() => armed && props.onAttempt(idx)}
                disabled={!armed || !active}
                className="mt-auto w-full rounded-xl p-4 text-base font-bold text-black transition-opacity disabled:opacity-40"
                style={{ backgroundColor: props.accent }}
              >
                {armed ? "I've recalled it — show answer" : "Recall it first…"}
              </button>
            )}
          </div>

          {/* BACK */}
          <div
            className={`absolute inset-0 flex flex-col overflow-hidden rounded-2xl border p-5 ${props.reducedMotion ? (revealed ? "" : "hidden") : "[backface-visibility:hidden] [transform:rotateY(180deg)]"}`}
            style={{ borderColor: `${props.accent}55`, backgroundColor: "#0E1520" }}
            aria-hidden={!revealed}
            aria-live={active ? "polite" : undefined}
          >
            <div className="mb-2 text-[10px] font-bold uppercase tracking-widest" style={{ color: props.accent }}>
              Answer
            </div>
            <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain text-sm leading-relaxed">
              {isQuestion && question ? (
                <div className="space-y-2">
                  {question.options.map((o, i) => {
                    const per = question.perOptionExplanations?.[String(i)];
                    const isCorrect = i === question.correctIndex;
                    const wasPick = st.attempted?.mcPick === i;
                    return (
                      <div
                        key={i}
                        className={`rounded-lg border p-2 ${isCorrect ? "border-emerald-600/60 bg-emerald-950/40" : wasPick ? "border-red-600/60 bg-red-950/40" : "border-neutral-800"}`}
                      >
                        <span className="mr-1 font-bold">{String.fromCharCode(65 + i)}.</span>
                        {o}
                        {per && <div className="mt-1 text-xs text-neutral-400">{per}</div>}
                      </div>
                    );
                  })}
                  <p className="whitespace-pre-wrap pt-2 text-neutral-300">{question.explanation}</p>
                  {question.examTakeaway && (
                    <p className="text-neutral-400">💡 {question.examTakeaway}</p>
                  )}
                  {!question.distractorRationale && (
                    <p className="text-xs text-amber-500">
                      ⚠ explanation incomplete — covers the correct answer only (see /gaps)
                    </p>
                  )}
                </div>
              ) : (
                <p className="whitespace-pre-wrap">{card?.back}</p>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* ── bottom action bar: confidence, then grades, same position ── */}
      {active && !st.graded && (
        <div className="fixed inset-x-0 bottom-0 z-30 bg-gradient-to-t from-[#0B1017] via-[#0B1017]/95 to-transparent px-4 pb-5 pt-8">
          <div className="mx-auto max-w-xl">
            {st.attempted && !st.confidence && (
              <div>
                <div className="mb-1.5 text-center text-[10px] uppercase tracking-widest text-neutral-500">
                  How confident are you? (before the answer)
                </div>
                <div className="grid grid-cols-4 gap-2">
                  {CONFIDENCES.map((c, i) => (
                    <button
                      key={c}
                      onClick={() => props.onConfidence(idx, c)}
                      className="rounded-xl border border-neutral-700 bg-neutral-900 py-3.5 text-sm font-semibold capitalize"
                    >
                      <span className="mr-1 text-[10px] text-neutral-600">{i + 1}</span>
                      {c}
                    </button>
                  ))}
                </div>
              </div>
            )}
            {st.revealed && !st.graded && (
              <div>
                <div className="mb-1.5 text-center text-[10px] uppercase tracking-widest text-neutral-500">
                  {isQuestion
                    ? mcWrong
                      ? "Incorrect — grade is Again"
                      : "Correct — how hard was it?"
                    : "Did you have it?"}
                </div>
                <div className="grid grid-cols-4 gap-2">
                  {GRADES.map((g, i) => {
                    const disabled = isQuestion && mcWrong && g !== "again";
                    return (
                      <button
                        key={g}
                        onClick={() => props.onGrade(idx, item, g)}
                        disabled={disabled}
                        className={`rounded-xl border py-3.5 text-sm font-semibold capitalize disabled:opacity-25 ${g === "again" ? "border-red-800 bg-red-950/60 text-red-300" : "border-neutral-700 bg-neutral-900"}`}
                      >
                        <span className="mr-1 text-[10px] text-neutral-600">{i + 1}</span>
                        {g}
                      </button>
                    );
                  })}
                </div>
              </div>
            )}
            {!st.attempted && (
              <div className="text-center text-[11px] text-neutral-600">
                {isQuestion ? "Pick an answer to continue" : "Attempt the recall first"} — skipping
                counts as a lapse
              </div>
            )}
          </div>
        </div>
      )}
      {active && st.graded && (
        <div className="fixed inset-x-0 bottom-0 z-30 px-4 pb-5">
          <div className="mx-auto max-w-xl text-center text-xs text-neutral-500">
            {st.correct ? "✓ recorded" : "✗ recorded"} — swipe up for the next card ↑
          </div>
        </div>
      )}
    </div>
  );
}

/* ================= checkpoint ================= */

function CheckpointSlot(props: {
  exam: ExamContent;
  stats: SessionStats;
  sessionGap: number | null;
  progress: Map<string, CardProgress>;
}) {
  const { exam, stats, sessionGap, progress } = props;
  const rows = exam.manifest.domains
    .filter((d) => !d.bonus)
    .map((d) => {
      const items = [...progress.values()].filter((p) => p.domainId === d.id);
      const settled = items.filter((p) => p.state === "durable" || p.state === "maintenance");
      const total = exam.cards.filter((c) => c.domainId === d.id).length +
        exam.questions.filter((q) => q.domainId === d.id).length;
      return { d, pct: total ? Math.floor((settled.length / total) * 100) : 0 };
    });
  const acc = stats.answered ? Math.round((stats.correct / stats.answered) * 100) : 0;
  return (
    <div className="mx-auto flex h-full max-w-xl flex-col justify-center px-6">
      <h2 className="text-xl font-bold">Checkpoint</h2>
      <p className="mb-5 text-xs text-neutral-500">
        {stats.answered} answered · {acc}% accuracy
        {sessionGap !== null && ` · calibration gap ${(sessionGap * 100).toFixed(0)}pp`} · streak{" "}
        {stats.streak}. Not a reward screen — a mirror.
      </p>
      {rows.map(({ d, pct }) => (
        <div key={d.id} className="mb-3">
          <div className="mb-1 flex justify-between text-xs text-neutral-400">
            <span>{d.name}</span>
            <span>{pct}% settled</span>
          </div>
          <div className="h-2 overflow-hidden rounded-full bg-neutral-800">
            <div className="h-full rounded-full" style={{ width: `${pct}%`, backgroundColor: d.color }} />
          </div>
        </div>
      ))}
      <p className="mt-4 text-center text-xs text-neutral-600">swipe up to continue ↑</p>
    </div>
  );
}

/* ================= summary ================= */

function SummarySlot(props: {
  stats: SessionStats;
  sessionGap: number | null;
  weakestDomain: string | null;
  medianMs: number | null;
  slug: string;
}) {
  const { stats, sessionGap, weakestDomain, medianMs } = props;
  return (
    <div className="mx-auto flex h-full max-w-xl flex-col justify-center px-6">
      <h2 className="text-2xl font-bold">Session complete</h2>
      <dl className="mt-6 space-y-3 text-sm">
        <div className="flex justify-between border-b border-neutral-800 pb-2">
          <dt className="text-neutral-400">Cards learned (state promotions)</dt>
          <dd className="font-bold">{stats.promotions}</dd>
        </div>
        <div className="flex justify-between border-b border-neutral-800 pb-2">
          <dt className="text-neutral-400">Lapses (incl. {stats.skipped} skipped)</dt>
          <dd className="font-bold">{stats.lapses}</dd>
        </div>
        <div className="flex justify-between border-b border-neutral-800 pb-2">
          <dt className="text-neutral-400">Session calibration gap</dt>
          <dd className="font-bold">
            {sessionGap === null ? "—" : `${sessionGap > 0 ? "+" : ""}${(sessionGap * 100).toFixed(0)}pp`}
          </dd>
        </div>
        <div className="flex justify-between border-b border-neutral-800 pb-2">
          <dt className="text-neutral-400">Median time per card</dt>
          <dd className="font-bold">{medianMs === null ? "—" : `${(medianMs / 1000).toFixed(1)}s`}</dd>
        </div>
        <div className="flex justify-between border-b border-neutral-800 pb-2">
          <dt className="text-neutral-400">Weakest domain this session</dt>
          <dd className="font-bold">{weakestDomain ?? "—"}</dd>
        </div>
      </dl>
      <p className="mt-6 text-sm text-neutral-300">
        Next action:{" "}
        {weakestDomain
          ? `drill ${weakestDomain} — it was your weakest this session.`
          : "come back tomorrow; criterion needs separate days."}
      </p>
      <Link href="/" className="mt-8 text-center text-sm underline" style={{ color: "#7FB8DE" }}>
        Back to exams
      </Link>
    </div>
  );
}
