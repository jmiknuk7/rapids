"use client";

/**
 * The Feed — Rapids' primary study surface. It RENDERS engine state:
 * queue composition lives in lib/learning/queue.ts and session behavior
 * (shownAt stamping, 2s arming, skip-lapse, read-only-after-skip, duration
 * metrics) lives in lib/learning/session.ts, where it is unit-tested. The
 * component dispatches actions and applies side effects (FSRS updates,
 * IndexedDB writes) when the session's record log grows — in event-handler
 * context, never in render or synchronously in effects.
 *
 * Layout contract (A11): chrome heights measured into --hud-h/--bar-h; one
 * scroll region per card face with a fade mask when content extends past
 * the fold; the 2s arming shows a fill so the wait is legible (the delay
 * itself is the mechanism and is not shortened).
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
import {
  createSession,
  reduceSession,
  isArmed,
  medianMsPerCard,
  sessionCounters,
  REVEAL_ARM_MS,
  type FeedSession,
  type FeedAction,
  type SlotUiState,
} from "../../../../lib/learning/session";
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
const CHECKPOINT_EVERY = 12;

type Slot =
  | { type: "item"; item: QueueItem }
  | { type: "checkpoint"; ordinal: number }
  | { type: "summary" };

export default function FeedClient({ slug }: { slug: string }) {
  const exam = getExamBySlug(slug)!;
  const accent = exam.manifest.accent;
  const cardsById = useMemo(() => new Map(exam.cards.map((c) => [c.id, c])), [exam]);
  const questionsById = useMemo(() => new Map(exam.questions.map((q) => [q.id, q])), [exam]);
  const domainsById = useMemo(() => new Map(exam.manifest.domains.map((d) => [d.id, d])), [exam]);
  const otherExams = EXAMS.filter((e) => e.manifest.slug !== slug);

  const [loading, setLoading] = useState(true);
  const [settings, setSettings] = useState<Settings | null>(null);
  const [slots, setSlots] = useState<Slot[]>([]);
  const [session, setSession] = useState<FeedSession>(() => createSession(0));
  const [promotions, setPromotions] = useState(0);
  const [domainFilter, setDomainFilter] = useState<string | null>(null);
  // Clock state updated by an interval — never Date.now() during render.
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
  /** Render-safe snapshot of progress (refs are never read during render). */
  const [progressSnapshot, setProgressSnapshot] = useState<Map<string, CardProgress>>(new Map());
  const containerRef = useRef<HTMLDivElement>(null);
  const rootRef = useRef<HTMLDivElement>(null);
  const startedAtRef = useRef(0);
  const summarySavedRef = useRef(false);
  const scheduler = useMemo(
    () => makeScheduler(settings?.retentionTarget ?? 0.9),
    [settings?.retentionTarget],
  );
  /** Synchronous mirror of session for event handlers (never read in render). */
  const sessionRef = useRef(session);
  const resetSession = useCallback((now: number) => {
    const fresh = createSession(now);
    sessionRef.current = fresh;
    setSession(fresh);
  }, []);

  const examSettings = settings?.exams[exam.manifest.id];
  const examDate = examSettings?.examDate ?? null;

  /* ---------- measured chrome heights → CSS vars (A11) ---------- */
  const measureInto = useCallback((cssVar: string) => {
    let ro: ResizeObserver | null = null;
    return (el: HTMLElement | null) => {
      ro?.disconnect();
      if (!el) return;
      const apply = () =>
        rootRef.current?.style.setProperty(cssVar, `${Math.ceil(el.getBoundingClientRect().height)}px`);
      ro = new ResizeObserver(apply);
      ro.observe(el);
      apply();
    };
  }, []);
  const measureHud = useMemo(() => measureInto("--hud-h"), [measureInto]);

  /* The action bar is owned by the active ItemSlot; the parent measures it
   * by query (a props-threaded ref cannot be verified render-safe). */
  const [barVersion, setBarVersion] = useState(0);
  useEffect(() => {
    const el = document.querySelector('[data-qa="action-bar"]') as HTMLElement | null;
    const root = rootRef.current;
    if (!el) {
      root?.style.setProperty("--bar-h", "16px");
      return;
    }
    const apply = () =>
      root?.style.setProperty("--bar-h", `${Math.ceil(el.getBoundingClientRect().height)}px`);
    const ro = new ResizeObserver(apply);
    ro.observe(el);
    apply();
    return () => ro.disconnect();
  }, [session.activeIdx, barVersion, loading]);

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
      setProgressSnapshot(new Map(progress));
      const now = Date.now();
      startedAtRef.current = now;
      const es = s.exams[exam.manifest.id];
      const params = new URLSearchParams(window.location.search);
      const seedParam = params.get("qaseed") ?? process.env.NEXT_PUBLIC_QA_SEED;
      const seed = seedParam ? Number(seedParam) : now % 2 ** 31;
      let queue = buildQueue({
        exam,
        progress,
        blindSpots,
        examDate: es?.examDate ?? null,
        examDateSetAt: es?.examDateSetAt ?? null,
        sessionSize: s.dailyReviewTarget,
        now,
        rng: mulberry32(seed),
      });
      const qaFirst = params.get("qafirst");
      if (qaFirst) {
        const hit = queue.find((i) => i.id === qaFirst);
        if (hit) queue = [hit, ...queue.filter((i) => i.id !== qaFirst)];
        else {
          const fromCard = cardsById.get(qaFirst) ?? questionsById.get(qaFirst);
          if (fromCard)
            queue = [
              {
                id: qaFirst,
                domainId: fromCard.domainId,
                kind: cardsById.has(qaFirst) ? "card" : "question",
                reason: "new",
                mode: "reference",
              },
              ...queue,
            ];
        }
      }
      const built: Slot[] = [];
      queue.forEach((item, i) => {
        built.push({ type: "item", item });
        if ((i + 1) % CHECKPOINT_EVERY === 0 && i + 1 < queue.length)
          built.push({ type: "checkpoint", ordinal: (i + 1) / CHECKPOINT_EVERY });
      });
      built.push({ type: "summary" });
      setSettings(s);
      setSlots(built);
      resetSession(now);
      setNowTick(now);
      setLoading(false);
    })();
    return () => {
      cancelled = true;
    };
  }, [exam, cardsById, questionsById, resetSession]);

  /* ---------- visible slots under the domain filter ---------- */
  const visibleSlots = useMemo(() => {
    if (!domainFilter) return slots;
    return slots.filter((s) => s.type !== "item" || s.item.domainId === domainFilter);
  }, [slots, domainFilter]);

  const changeFilter = (d: string | null) => {
    // Slot indexes are session keys; a filter change re-indexes the list, so
    // it starts a fresh visible session (records already persisted stand).
    setDomainFilter(d);
    resetSession(Date.now());
    containerRef.current?.scrollTo({ top: 0 });
  };

  /* ---------- 2s arming tick ---------- */
  useEffect(() => {
    const t = setInterval(() => setNowTick(Date.now()), 250);
    return () => clearInterval(t);
  }, []);

  /* ---------- dispatch with side effects (event context only) ----------
   * The reducer runs OUTSIDE the setState updater (updaters must stay pure:
   * StrictMode double-invokes them, which would double-write reviews). A ref
   * mirror gives handlers the current session synchronously. */
  const dispatch = useCallback(
    (action: FeedAction) => {
      const prev = sessionRef.current;
      const next = reduceSession(prev, action);
      if (next === prev) return;
      // Persist any NEW records (grade or skip-lapse), exactly once each.
      for (const rec of next.records.slice(prev.records.length)) {
        const slot = visibleSlots[rec.idx];
        if (!slot || slot.type !== "item") continue;
        const item = slot.item;
        const now = rec.at;
        const before =
          progressRef.current.get(item.id) ??
          initialProgress(item.id, exam.manifest.id, item.domainId, now);
        const advanced = advanceState(before, rec.correct, now);
        const { card, intervalDays } = scheduler.review(before.fsrs, rec.grade, now);
        const clamped = clampInterval(intervalDays, now, examDate);
        const updated: CardProgress = {
          ...advanced,
          fsrs: { ...card, due: new Date(now + clamped * DAY_MS) },
        };
        progressRef.current.set(item.id, updated);
        setProgressSnapshot(new Map(progressRef.current));
        if (
          rec.correct &&
          CARD_STATE_ORDER.indexOf(updated.state) > CARD_STATE_ORDER.indexOf(before.state)
        )
          setPromotions((p) => p + 1);
        void saveProgress(updated);
        void appendEvent({
          cardId: item.id,
          examId: exam.manifest.id,
          domainId: item.domainId,
          at: now,
          grade: rec.grade,
          confidence: rec.confidence,
          correct: rec.correct,
          ...(rec.skipped ? { skipped: true } : {}),
        });
        if (typeof navigator !== "undefined") navigator.vibrate?.(rec.correct ? 8 : [20, 30, 20]);
      }
      sessionRef.current = next;
      setSession(next);
      setBarVersion((v) => v + 1);
    },
    [visibleSlots, exam, scheduler, examDate],
  );

  const advanceTo = useCallback((idx: number) => {
    const el = containerRef.current;
    if (!el) return;
    el.scrollTo({ top: idx * el.clientHeight, behavior: "smooth" });
  }, []);

  const onScroll = useCallback(() => {
    const el = containerRef.current;
    if (!el || !el.clientHeight) return;
    const idx = Math.round(el.scrollTop / el.clientHeight);
    if (idx !== sessionRef.current.activeIdx) dispatch({ type: "activate", idx, at: Date.now() });
  }, [dispatch]);

  function onGrade(idx: number, item: QueueItem, grade: ReviewGrade) {
    const st = session.slots[idx] ?? {};
    const q = item.kind === "question" ? questionsById.get(item.id) : undefined;
    const correct = q ? st.attempted?.mcPick === q.correctIndex : grade !== "again";
    dispatch({ type: "grade", idx, grade, correct, at: Date.now() });
    window.setTimeout(() => advanceTo(idx + 1), 350);
  }

  /* ---------- keyboard ---------- */
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement) return;
      const idx = session.activeIdx;
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
      const st = session.slots[idx] ?? {};
      const item = slot.item;
      const isQuestion = item.kind === "question";
      if (e.key === " " && !isQuestion && !st.attempted && !st.skipped) {
        e.preventDefault();
        if (isArmed(session, idx, Date.now())) dispatch({ type: "attempt", idx, at: Date.now() });
        return;
      }
      const n = Number(e.key);
      if (n >= 1 && n <= 4) {
        e.preventDefault();
        if (st.skipped) return; // grading locked after a skip-lapse
        if (!st.attempted && isQuestion)
          dispatch({ type: "attempt", idx, at: Date.now(), mcPick: n - 1 });
        else if (st.attempted && !st.confidence)
          dispatch({ type: "confidence", idx, confidence: CONFIDENCES[n - 1] });
        else if (st.revealed && !st.graded) onGrade(idx, item, GRADES[n - 1]);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [session, visibleSlots]);

  /* ---------- session summary ---------- */
  const counters = sessionCounters(session);
  const itemAt = useCallback(
    (idx: number): QueueItem | null => {
      const s = visibleSlots[idx];
      return s && s.type === "item" ? s.item : null;
    },
    [visibleSlots],
  );

  const confidenceAttempts = useMemo(
    () =>
      session.records
        .filter((r) => r.confidence !== null)
        .map((r) => ({
          domainId: itemAt(r.idx)?.domainId ?? null,
          confidence: r.confidence as Confidence,
          correct: r.correct,
        })),
    [session.records, itemAt],
  );

  const sessionGap = useMemo(() => {
    if (!confidenceAttempts.length) return null;
    const CONF = { guess: 0.25, unsure: 0.5, confident: 0.75, certain: 0.95 } as const;
    const stated =
      confidenceAttempts.reduce((a, x) => a + CONF[x.confidence], 0) / confidenceAttempts.length;
    const acc = confidenceAttempts.filter((x) => x.correct).length / confidenceAttempts.length;
    return stated - acc;
  }, [confidenceAttempts]);

  const byDomain = useMemo(() => {
    const out: Record<string, { seen: number; correct: number }> = {};
    for (const r of session.records) {
      const d = itemAt(r.idx)?.domainId ?? "cross";
      out[d] = { seen: (out[d]?.seen ?? 0) + 1, correct: (out[d]?.correct ?? 0) + (r.correct ? 1 : 0) };
    }
    return out;
  }, [session.records, itemAt]);

  const weakestDomain = useMemo(() => {
    const entries = Object.entries(byDomain).filter(([k]) => k !== "cross");
    if (!entries.length) return null;
    return entries.reduce((w, e) => (e[1].correct / e[1].seen < w[1].correct / w[1].seen ? e : w))[0];
  }, [byDomain]);

  useEffect(() => {
    const summaryIdx = visibleSlots.findIndex((s) => s.type === "summary");
    if (
      summaryIdx !== -1 &&
      session.activeIdx === summaryIdx &&
      !summarySavedRef.current &&
      counters.answered > 0
    ) {
      summarySavedRef.current = true;
      void addSession({
        examId: exam.manifest.id,
        startedAt: startedAtRef.current,
        endedAt: Date.now(),
        answered: counters.answered,
        correct: counters.correct,
        lapses: counters.lapses,
        skipped: counters.skipped,
        promotions,
        calibrationGap: sessionGap,
        medianMsPerCard: medianMsPerCard(session),
        weakestDomainId: weakestDomain,
      });
    }
  }, [session, visibleSlots, counters, promotions, sessionGap, weakestDomain, exam.manifest.id]);

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
    <div ref={rootRef} className="bg-[#0B1017] text-neutral-100">
      {/* ── fixed HUD (measured into --hud-h) ── */}
      <div
        ref={measureHud}
        data-qa="hud"
        className="pointer-events-none fixed inset-x-0 top-0 z-40 bg-gradient-to-b from-[#0B1017] via-[#0B1017]/95 to-[#0B1017]/60 pb-2"
      >
        <div className="pointer-events-auto flex min-h-11 items-center gap-3 px-4 pt-2 text-xs">
          <span className="font-bold" style={{ color: accent }}>
            {exam.manifest.shortName}
          </span>
          <span aria-label={`streak ${counters.streak}`} className="text-amber-400">
            🔥 {counters.streak}
          </span>
          <span className="text-neutral-400">
            {counters.answered}/{total}
          </span>
          <div className="ml-auto flex gap-2">
            {otherExams.map((e) => (
              <Link
                key={e.manifest.id}
                href={`/exam/${e.manifest.slug}/feed`}
                className="flex min-h-11 min-w-11 items-center justify-center rounded-full border border-neutral-700 px-3 text-neutral-400"
              >
                → {e.manifest.shortName}
              </Link>
            ))}
          </div>
        </div>
        <div className="pointer-events-auto mt-1 flex gap-1.5 overflow-x-auto px-4 [scrollbar-width:none] [@media(max-height:480px)]:hidden">
          <button
            onClick={() => changeFilter(null)}
            className={`flex min-h-11 min-w-11 shrink-0 items-center justify-center rounded-full border px-3 text-[11px] ${!domainFilter ? "border-neutral-400 text-neutral-100" : "border-neutral-700 text-neutral-500"}`}
          >
            All
          </button>
          {exam.manifest.domains.map((d) => (
            <button
              key={d.id}
              onClick={() => changeFilter(domainFilter === d.id ? null : d.id)}
              className={`flex min-h-11 min-w-11 shrink-0 items-center justify-center rounded-full border px-3 text-[11px] ${domainFilter === d.id ? "text-white" : "border-neutral-700 text-neutral-500"}`}
              style={domainFilter === d.id ? { backgroundColor: d.color, borderColor: d.color } : {}}
            >
              {d.short}
            </button>
          ))}
        </div>
        {examDate === null && (
          <div
            data-qa="no-exam-date-banner"
            className="pointer-events-auto mx-4 mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 rounded-lg border border-amber-600/50 bg-amber-950/80 px-3 py-1.5 text-[11px] text-amber-200"
          >
            <span className="min-w-0 flex-1 basis-52">
              ⚠ No exam date set — deadline scheduling is INACTIVE.
            </span>
            <span className="flex items-center gap-2">
              <input
                type="date"
                value={dateDraft}
                onChange={(e) => setDateDraft(e.target.value)}
                className="h-11 w-40 max-w-full rounded border border-amber-700 bg-transparent px-2 text-amber-100"
                aria-label="Exam date"
              />
              <button
                onClick={() => void saveExamDate()}
                className="h-11 rounded bg-amber-600 px-4 font-bold text-black"
              >
                Set
              </button>
            </span>
          </div>
        )}
      </div>

      {/* ── snap feed ── */}
      <div
        ref={containerRef}
        onScroll={onScroll}
        data-qa="feed-scroll"
        className="h-dvh snap-y snap-mandatory overflow-y-scroll overscroll-none [scrollbar-width:none]"
      >
        {visibleSlots.map((slot, idx) => {
          const inWindow = Math.abs(idx - session.activeIdx) <= 2;
          return (
            <section
              key={idx}
              data-qa="slot"
              data-slot-type={slot.type}
              className="h-dvh snap-start [scroll-snap-stop:always]"
              aria-hidden={idx !== session.activeIdx}
            >
              {inWindow && slot.type === "item" && (
                <ItemSlot
                  idx={idx}
                  item={slot.item}
                  card={cardsById.get(slot.item.id)}
                  question={questionsById.get(slot.item.id)}
                  domainName={
                    slot.item.domainId
                      ? (domainsById.get(slot.item.domainId)?.short ?? slot.item.domainId)
                      : "Cross-domain"
                  }
                  accent={accent}
                  st={session.slots[idx] ?? {}}
                  active={idx === session.activeIdx}
                  shownAt={session.shownAt[idx]}
                  now={nowTick}
                  reducedMotion={reducedMotion}
                  flipStyle={flipStyle}
                  dispatch={dispatch}
                  onGrade={onGrade}
                />
              )}
              {inWindow && slot.type === "checkpoint" && (
                <CheckpointSlot
                  exam={exam}
                  counters={counters}
                  sessionGap={sessionGap}
                  progress={progressSnapshot}
                />
              )}
              {inWindow && slot.type === "summary" && (
                <SummarySlot
                  counters={counters}
                  promotions={promotions}
                  sessionGap={sessionGap}
                  weakestDomain={
                    weakestDomain ? (domainsById.get(weakestDomain)?.name ?? weakestDomain) : null
                  }
                  medianMs={medianMsPerCard(session)}
                />
              )}
            </section>
          );
        })}
      </div>
    </div>
  );
}

/* ================= fade-scroll wrapper (A11 review, finding 1) ================= */

function FadeScroll(props: {
  dataQa: string;
  className?: string;
  fadeColor: string;
  children: React.ReactNode;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const [clipped, setClipped] = useState(false);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const update = () => setClipped(el.scrollHeight - el.scrollTop - el.clientHeight > 8);
    const ro = new ResizeObserver(update); // fires async on observe → initial state
    ro.observe(el);
    el.addEventListener("scroll", update, { passive: true });
    return () => {
      ro.disconnect();
      el.removeEventListener("scroll", update);
    };
  }, []);
  return (
    <div className="relative flex min-h-0 flex-1 flex-col">
      <div
        ref={ref}
        data-qa={props.dataQa}
        className={`feed-scroll-pad min-h-0 flex-1 overflow-y-auto overscroll-contain ${props.className ?? ""}`}
      >
        {props.children}
      </div>
      <div
        aria-hidden
        className="pointer-events-none absolute inset-x-0 bottom-0 h-12 transition-opacity duration-150"
        style={{
          backgroundImage: `linear-gradient(to top, ${props.fadeColor}, transparent)`,
          opacity: clipped ? 1 : 0,
        }}
      />
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
  st: SlotUiState;
  active: boolean;
  shownAt: number | undefined;
  now: number;
  reducedMotion: boolean;
  flipStyle: (revealed: boolean) => React.CSSProperties;
  dispatch: (a: FeedAction) => void;
  onGrade: (idx: number, item: QueueItem, g: ReviewGrade) => void;
}) {
  const { idx, item, card, question, domainName, st, active, dispatch } = props;
  const revealed = !!st.revealed;
  const isQuestion = item.kind === "question";
  const armed = !!props.shownAt && props.now - props.shownAt >= REVEAL_ARM_MS;
  const typeLabel = isQuestion ? TYPE_LABEL.question : TYPE_LABEL[card?.type ?? "recall"];
  const modeLabel =
    item.mode.replace(/-/g, " ") === typeLabel ? null : item.mode.replace(/-/g, " ");
  const front = isQuestion ? question?.question : card?.front;
  const mcWrong = isQuestion && st.attempted?.mcPick !== question?.correctIndex;
  const cardState = st.skipped
    ? "skipped"
    : st.graded
      ? "graded"
      : st.revealed
        ? "revealed"
        : st.attempted
          ? "attempted"
          : "front";

  return (
    <div
      data-qa="item"
      data-kind={isQuestion ? "question" : card?.type}
      data-card-state={cardState}
      className="feed-slot-pad mx-auto flex h-full max-w-xl flex-col px-4"
    >
      {/* meta row (hidden at short heights) */}
      <div className="mb-2 flex flex-wrap items-center gap-2 text-[10px] uppercase tracking-wider [@media(max-height:480px)]:hidden">
        <span className="text-neutral-500">{domainName}</span>
        <span className="rounded-full border border-neutral-700 px-2 py-0.5 text-neutral-400">
          {typeLabel}
        </span>
        {modeLabel && (
          <span className="rounded-full border border-neutral-800 px-2 py-0.5 text-neutral-500" title="Diátaxis mode (A10)">
            {modeLabel}
          </span>
        )}
        <span className={`rounded-full border px-2 py-0.5 ${REASON_STYLE[item.reason]}`} title="Why this card was selected">
          {REASON_LABEL[item.reason]}
        </span>
      </div>
      {st.skipped && (
        <div data-qa="skip-lock-label" className="mb-2 text-[11px] font-semibold text-red-400">
          Recorded as a lapse (skipped) — grading locked; this card will return in the queue.
        </div>
      )}

      {/* flip container */}
      <div className="relative min-h-0 flex-1" style={{ perspective: 1400 }}>
        <div className="relative h-full w-full" style={props.flipStyle(revealed)}>
          {/* FRONT — one scroll region with fade mask. The hidden face gets
              pointer-events-none: WebKit hit-tests backface-hidden rotated
              faces (Chromium does not), so without it the invisible face
              blocks every tap on real iOS — caught by the WebKit pass leg. */}
          <div
            className={`absolute inset-0 flex flex-col overflow-hidden rounded-2xl border border-neutral-800 bg-[#101722] p-4 [@media(max-height:480px)]:p-3 ${revealed ? "pointer-events-none " : ""}${props.reducedMotion ? (revealed ? "hidden" : "") : "[backface-visibility:hidden]"}`}
            aria-hidden={revealed}
          >
            <FadeScroll dataQa="card-front-scroll" fadeColor="#101722">
              <p className="text-base font-semibold leading-relaxed sm:text-lg">{front}</p>
              {isQuestion && question && (
                <div className="mt-4 space-y-2 pb-1">
                  {question.options.map((o, i) => (
                    <button
                      key={i}
                      onClick={() => dispatch({ type: "attempt", idx, at: Date.now(), mcPick: i })}
                      disabled={!!st.attempted || st.skipped}
                      className={`min-h-11 w-full rounded-xl border p-3 text-left text-sm ${st.attempted?.mcPick === i ? "border-neutral-300 bg-neutral-800" : "border-neutral-700 bg-neutral-900/60"}`}
                    >
                      <span className="mr-2 font-bold text-neutral-500">
                        {String.fromCharCode(65 + i)}
                      </span>
                      {o}
                    </button>
                  ))}
                </div>
              )}
              {!isQuestion && !st.attempted && !st.skipped && (
                <button
                  data-qa="recall-attempt"
                  onClick={() => armed && dispatch({ type: "attempt", idx, at: Date.now() })}
                  disabled={!armed || !active}
                  className="feed-attempt-sticky relative mt-3 min-h-11 w-full overflow-hidden rounded-xl p-3 text-base font-bold text-black transition-opacity disabled:opacity-60"
                  style={{ backgroundColor: props.accent }}
                >
                  {/* 2s arming made legible: a fill completes over the delay
                      (the delay itself is the mechanism and stays 2s). */}
                  {!armed && active && (
                    <span
                      key={props.shownAt ?? 0}
                      aria-hidden
                      className="rapids-arm-fill absolute inset-y-0 left-0 bg-black/25"
                    />
                  )}
                  <span className="relative">
                    {armed ? "I've recalled it — show answer" : "Recall it first…"}
                  </span>
                </button>
              )}
              {st.skipped && !st.revealed && (
                <button
                  data-qa="reveal-skipped"
                  onClick={() => dispatch({ type: "reveal-skipped", idx })}
                  className="mt-3 min-h-11 w-full rounded-xl border border-neutral-600 p-3 text-base font-semibold text-neutral-200"
                >
                  Show answer (already recorded as a lapse)
                </button>
              )}
            </FadeScroll>
          </div>

          {/* BACK — pointer-events-none while hidden (see FRONT note) */}
          <div
            className={`absolute inset-0 flex flex-col overflow-hidden rounded-2xl border p-4 [@media(max-height:480px)]:p-3 ${revealed ? "" : "pointer-events-none "}${props.reducedMotion ? (revealed ? "" : "hidden") : "[backface-visibility:hidden] [transform:rotateY(180deg)]"}`}
            style={{ borderColor: `${props.accent}55`, backgroundColor: "#0E1520" }}
            aria-hidden={!revealed}
            aria-live={active ? "polite" : undefined}
          >
            <div
              className="mb-2 shrink-0 text-[10px] font-bold uppercase tracking-widest [@media(max-height:480px)]:mb-1"
              style={{ color: props.accent }}
            >
              Answer
            </div>
            <FadeScroll dataQa="card-back-scroll" fadeColor="#0E1520" className="text-sm leading-relaxed">
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
                  {question.examTakeaway && <p className="text-neutral-400">💡 {question.examTakeaway}</p>}
                  {!question.distractorRationale && (
                    <p className="text-xs text-amber-500">
                      ⚠ explanation incomplete — covers the correct answer only (see /gaps)
                    </p>
                  )}
                </div>
              ) : (
                <p className="whitespace-pre-wrap">{card?.back}</p>
              )}
            </FadeScroll>
          </div>
        </div>
      </div>

      {/* ── bottom action bar: confidence, then grades, same position ── */}
      {active && !st.graded && !st.skipped && (
        <div
          data-qa="action-bar"
          className="fixed inset-x-0 bottom-0 z-30 bg-gradient-to-t from-[#0B1017] via-[#0B1017]/95 to-transparent px-4 pb-3 pt-6 [@media(max-height:480px)]:pb-2 [@media(max-height:480px)]:pt-2"
        >
          <div className="mx-auto max-w-xl">
            {st.attempted && !st.confidence && (
              <div data-qa="confidence-row">
                <div className="mb-1 text-center text-[10px] uppercase tracking-widest text-neutral-500 [@media(max-height:480px)]:hidden">
                  How confident are you? (before the answer)
                </div>
                <div className="grid grid-cols-4 gap-2">
                  {CONFIDENCES.map((c, i) => (
                    <button
                      key={c}
                      onClick={() => dispatch({ type: "confidence", idx, confidence: c })}
                      className="min-h-11 rounded-xl border border-neutral-700 bg-neutral-900 py-2.5 text-sm font-semibold capitalize"
                    >
                      <span className="mr-1 text-[10px] text-neutral-600">{i + 1}</span>
                      {c}
                    </button>
                  ))}
                </div>
              </div>
            )}
            {st.revealed && !st.graded && (
              <div data-qa="grade-row">
                <div className="mb-1 text-center text-[10px] uppercase tracking-widest text-neutral-500 [@media(max-height:480px)]:hidden">
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
                        className={`min-h-11 rounded-xl border py-2.5 text-sm font-semibold capitalize disabled:opacity-25 ${g === "again" ? "border-red-800 bg-red-950/60 text-red-300" : "border-neutral-700 bg-neutral-900"}`}
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
              <div className="py-1 text-center text-[11px] text-neutral-600">
                {isQuestion ? "Pick an answer to continue" : "Attempt the recall first"} — skipping
                counts as a lapse
              </div>
            )}
          </div>
        </div>
      )}
      {active && (st.graded || st.skipped) && (
        <div data-qa="action-bar" className="fixed inset-x-0 bottom-0 z-30 px-4 pb-4">
          <div className="mx-auto max-w-xl text-center text-xs text-neutral-500">
            {st.skipped
              ? "Lapse recorded — swipe up to continue ↑"
              : `${st.correct ? "✓" : "✗"} recorded — swipe up for the next card ↑`}
          </div>
        </div>
      )}
    </div>
  );
}

/* ================= checkpoint ================= */

function CheckpointSlot(props: {
  exam: ExamContent;
  counters: ReturnType<typeof sessionCounters>;
  sessionGap: number | null;
  progress: Map<string, CardProgress>;
}) {
  const { exam, counters, sessionGap, progress } = props;
  const rows = exam.manifest.domains
    .filter((d) => !d.bonus)
    .map((d) => {
      const items = [...progress.values()].filter((p) => p.domainId === d.id);
      const settled = items.filter((p) => p.state === "durable" || p.state === "maintenance");
      const total =
        exam.cards.filter((c) => c.domainId === d.id).length +
        exam.questions.filter((q) => q.domainId === d.id).length;
      return { d, pct: total ? Math.floor((settled.length / total) * 100) : 0 };
    });
  const acc = counters.answered ? Math.round((counters.correct / counters.answered) * 100) : 0;
  return (
    <div
      data-qa="checkpoint"
      className="mx-auto flex h-full max-w-xl flex-col justify-center overflow-y-auto px-6"
      style={{ paddingTop: "var(--hud-h, 96px)", paddingBottom: "24px" }}
    >
      <h2 className="text-xl font-bold">Checkpoint</h2>
      <p className="mb-4 text-xs text-neutral-500">
        {counters.answered} answered · {acc}% accuracy
        {sessionGap !== null && ` · calibration gap ${(sessionGap * 100).toFixed(0)}pp`} · streak{" "}
        {counters.streak}. Not a reward screen — a mirror.
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
      <p className="mt-3 text-center text-xs text-neutral-600">swipe up to continue ↑</p>
    </div>
  );
}

/* ================= summary ================= */

function SummarySlot(props: {
  counters: ReturnType<typeof sessionCounters>;
  promotions: number;
  sessionGap: number | null;
  weakestDomain: string | null;
  medianMs: number | null;
}) {
  const { counters, promotions, sessionGap, weakestDomain, medianMs } = props;
  return (
    <div
      data-qa="summary"
      className="mx-auto flex h-full max-w-xl flex-col justify-center overflow-y-auto px-6"
      style={{ paddingTop: "var(--hud-h, 96px)", paddingBottom: "24px" }}
    >
      <h2 className="text-2xl font-bold">Session complete</h2>
      <dl className="mt-5 space-y-3 text-sm">
        <div className="flex justify-between border-b border-neutral-800 pb-2">
          <dt className="text-neutral-400">Cards learned (state promotions)</dt>
          <dd className="font-bold">{promotions}</dd>
        </div>
        <div className="flex justify-between border-b border-neutral-800 pb-2">
          <dt className="text-neutral-400">Lapses (incl. {counters.skipped} skipped)</dt>
          <dd className="font-bold">{counters.lapses}</dd>
        </div>
        <div className="flex justify-between border-b border-neutral-800 pb-2">
          <dt className="text-neutral-400">Session calibration gap</dt>
          <dd className="font-bold">
            {sessionGap === null
              ? "—"
              : `${sessionGap > 0 ? "+" : ""}${(sessionGap * 100).toFixed(0)}pp`}
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
      <p className="mt-5 text-sm text-neutral-300">
        Next action:{" "}
        {weakestDomain
          ? `drill ${weakestDomain} — it was your weakest this session.`
          : "come back tomorrow; criterion needs separate days."}
      </p>
      <Link
        href="/"
        className="mt-6 flex min-h-11 items-center justify-center text-center text-sm underline"
        style={{ color: "#7FB8DE" }}
      >
        Back to exams
      </Link>
    </div>
  );
}
