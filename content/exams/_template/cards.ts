import type { Card } from "../../schema";

/** TEMPLATE — id convention: {examId}-{recall|scen|trap}-{domainId}-{nnn}, stable forever. */
export const cards: Card[] = [
  {
    id: "template-recall-d1-001",
    examId: "template",
    domainId: "d1",
    type: "recall",
    front: "Question the learner must answer from memory before revealing.",
    back: "The answer, verbatim from a cited source.",
    sourceIds: ["template-exam-guide"],
  },
  {
    id: "template-trap-001",
    examId: "template",
    domainId: null, // cross-domain traps allowed; excluded from weighted quota
    type: "trap",
    front: "⚠️ TRAP: a plausible-sounding wrong approach.",
    back: "Why it fails, with the correct approach.",
    sourceIds: ["template-derived-example"],
  },
];
