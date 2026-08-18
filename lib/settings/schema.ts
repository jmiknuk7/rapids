import { z } from "zod";

/**
 * User settings schema. Defined in Phase 1 (Amendment 6, 2026-08-17) because
 * the deadline-aware scheduler (Amendment 1) depends on exam target dates
 * existing as first-class state from the start.
 *
 * examDate defaults to null. The dashboard must PROMPT for a date when null —
 * the scheduler never silently behaves as if the horizon were infinite.
 */
export const ExamSettingsSchema = z.object({
  /** ISO date (YYYY-MM-DD) of the user's exam appointment, or null if unset. */
  examDate: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/)
    .nullable()
    .default(null),
  /**
   * ISO date the exam date was (last) set. Anchors the A1 consolidation
   * window: consolidation begins at 80% of [examDateSetAt, examDate].
   * Stamped by the settings layer whenever examDate changes.
   */
  examDateSetAt: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/)
    .nullable()
    .default(null),
});

export const SettingsSchema = z.object({
  exams: z.record(z.string(), ExamSettingsSchema).default({}),
  dailyReviewTarget: z.number().int().min(5).max(500).default(40),
  /** FSRS requested retention. */
  retentionTarget: z.number().min(0.7).max(0.99).default(0.9),
  reducedMotion: z.boolean().default(false),
});

export type ExamSettings = z.infer<typeof ExamSettingsSchema>;
export type Settings = z.infer<typeof SettingsSchema>;

export const defaultSettings = (): Settings => SettingsSchema.parse({});
