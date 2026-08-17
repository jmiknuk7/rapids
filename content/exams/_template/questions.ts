import type { Question } from "../../schema";

/** TEMPLATE — see content/README.md for distractorRationale and official rules. */
export const questions: Question[] = [
  {
    id: "template-q-d1-001",
    examId: "template",
    domainId: "d1",
    question: "Exam-format multiple-choice question?",
    options: ["Right answer", "Wrong answer B", "Wrong answer C", "Wrong answer D"],
    correctIndex: 0,
    explanation: "Why the right answer is right.",
    perOptionExplanations: {
      "1": "Why B is wrong.",
      "2": "Why C is wrong.",
      "3": "Why D is wrong.",
    },
    // true ONLY when every wrong option's failure is explained:
    distractorRationale: true,
    official: false,
    sourceIds: ["template-exam-guide"],
  },
];
