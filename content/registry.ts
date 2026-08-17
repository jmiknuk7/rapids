import type { ExamContent } from "./schema";

import { manifest as ccafManifest } from "./exams/cca-f/manifest";
import { sources as ccafSources } from "./exams/cca-f/sources";
import { cards as ccafCards } from "./exams/cca-f/cards";
import { questions as ccafQuestions } from "./exams/cca-f/questions";
import { sections as ccafSections } from "./exams/cca-f/sections";

import { manifest as snowproManifest } from "./exams/snowpro-c03/manifest";
import { sources as snowproSources } from "./exams/snowpro-c03/sources";
import { cards as snowproCards } from "./exams/snowpro-c03/cards";
import { questions as snowproQuestions } from "./exams/snowpro-c03/questions";
import { sections as snowproSections } from "./exams/snowpro-c03/sections";

/**
 * The exam registry. Adding an exam = one folder under content/exams/
 * (copy content/exams/_template) + one entry here. Nothing else changes:
 * no component, route, or engine edits. See content/README.md.
 */
export const EXAMS: ExamContent[] = [
  {
    manifest: ccafManifest,
    sources: ccafSources,
    cards: ccafCards,
    questions: ccafQuestions,
    sections: ccafSections,
  },
  {
    manifest: snowproManifest,
    sources: snowproSources,
    cards: snowproCards,
    questions: snowproQuestions,
    sections: snowproSections,
  },
];

export const getExamBySlug = (slug: string): ExamContent | undefined =>
  EXAMS.find((e) => e.manifest.slug === slug);

export const getExamById = (id: string): ExamContent | undefined =>
  EXAMS.find((e) => e.manifest.id === id);
