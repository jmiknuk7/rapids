import type { Section } from "../../schema";

/** TEMPLATE — long-form read-and-review content, markdown body. */
export const sections: Section[] = [
  {
    id: "template-sec-d1-001",
    examId: "template",
    domainId: "d1",
    title: "A study section",
    body: "Markdown body. Tables and ```code fences``` supported.",
    checklist: ["A checkable topic the learner ticks after closed-book recall"],
    sourceIds: ["template-exam-guide"],
  },
];
