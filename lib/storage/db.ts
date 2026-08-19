"use client";

import { openDB, type DBSchema, type IDBPDatabase } from "idb";
import type { CardProgress, ReviewEvent } from "../learning/types";
import { SettingsSchema, defaultSettings, type Settings } from "../settings/schema";

/**
 * Device-local persistence (idb). No backend, no auth: IndexedDB is the
 * store of record, written through on every review, so airplane mode and
 * force-quits lose nothing — the write happens before the next card is
 * served. localStorage would not hold this data volume (review history
 * grows unbounded); IndexedDB does.
 *
 * FSRS due dates are Date objects inside CardProgress; IndexedDB's
 * structured clone handles Date natively, so progress rows round-trip
 * without serialization glue.
 */

export interface SessionSummary {
  examId: string;
  startedAt: number;
  endedAt: number;
  answered: number;
  correct: number;
  lapses: number;
  skipped: number;
  promotions: number;
  calibrationGap: number | null;
  medianMsPerCard: number | null;
  weakestDomainId: string | null;
}

interface RapidsDB extends DBSchema {
  progress: { key: string; value: CardProgress; indexes: { byExam: string } };
  events: { key: number; value: ReviewEvent & { id?: number }; indexes: { byExam: string } };
  sessions: { key: number; value: SessionSummary & { id?: number } };
  settings: { key: string; value: Settings };
}

let dbPromise: Promise<IDBPDatabase<RapidsDB>> | null = null;

export function getDB(): Promise<IDBPDatabase<RapidsDB>> {
  dbPromise ??= openDB<RapidsDB>("rapids-v1", 1, {
    upgrade(db) {
      const progress = db.createObjectStore("progress", { keyPath: "cardId" });
      progress.createIndex("byExam", "examId");
      const events = db.createObjectStore("events", { keyPath: "id", autoIncrement: true });
      events.createIndex("byExam", "examId");
      db.createObjectStore("sessions", { keyPath: "id", autoIncrement: true });
      db.createObjectStore("settings");
    },
  });
  return dbPromise;
}

export async function loadProgress(examId: string): Promise<Map<string, CardProgress>> {
  const db = await getDB();
  const rows = await db.getAllFromIndex("progress", "byExam", examId);
  return new Map(rows.map((r) => [r.cardId, r]));
}

export async function saveProgress(p: CardProgress): Promise<void> {
  const db = await getDB();
  await db.put("progress", p);
}

export async function appendEvent(e: ReviewEvent): Promise<void> {
  const db = await getDB();
  await db.add("events", e);
}

export async function loadEvents(examId: string): Promise<ReviewEvent[]> {
  const db = await getDB();
  return db.getAllFromIndex("events", "byExam", examId);
}

export async function addSession(s: SessionSummary): Promise<void> {
  const db = await getDB();
  await db.add("sessions", s);
}

export async function loadSettings(): Promise<Settings> {
  const db = await getDB();
  const raw = await db.get("settings", "settings");
  const parsed = SettingsSchema.safeParse(raw ?? {});
  return parsed.success ? parsed.data : defaultSettings();
}

export async function saveSettings(s: Settings): Promise<void> {
  const db = await getDB();
  await db.put("settings", s, "settings");
}

/**
 * Standing blind spots for an exam: item ids whose most recent
 * confidence-stated review was Certain + Wrong. A later correct review
 * clears the flag.
 */
export async function loadBlindSpots(examId: string): Promise<Set<string>> {
  const events = await loadEvents(examId);
  const latest = new Map<string, ReviewEvent>();
  for (const e of events) {
    if (e.confidence === null) continue;
    const prev = latest.get(e.cardId);
    if (!prev || e.at >= prev.at) latest.set(e.cardId, e);
  }
  const out = new Set<string>();
  for (const [id, e] of latest) if (e.confidence === "certain" && !e.correct) out.add(id);
  return out;
}
