import type { Job, QuestionCategory, QuestionTemplate } from "./types";

function question(
  id: string,
  category: QuestionCategory,
  competency: string,
  prompt: string,
): QuestionTemplate {
  return { id, category, competency, prompt };
}

export const JOBS: Job[] = [
  {
    id: "frontend-platform-engineer",
    title: "Frontend Platform Engineer",
    description:
      "Build reusable React systems, improve accessibility and performance, and help product teams ship reliable user experiences.",
    competencies: [
      "React architecture",
      "accessibility",
      "performance",
      "testing",
      "collaboration",
      "systems thinking",
    ],
    questionPack: {
      behavioral: [
        question(
          "fe-b1",
          "behavioral",
          "collaboration",
          "For this Frontend Platform Engineer role, tell me about a time you helped multiple product teams adopt a shared UI pattern or platform capability.",
        ),
        question(
          "fe-b2",
          "behavioral",
          "systems thinking",
          "As a Frontend Platform Engineer, describe a situation where you improved a frontend system by simplifying the architecture rather than adding more tooling.",
        ),
        question(
          "fe-b3",
          "behavioral",
          "testing",
          "For this Frontend Platform Engineer role, how do you decide which frontend behaviors deserve automated tests versus manual verification?",
        ),
      ],
      technical: [
        question(
          "fe-t1",
          "technical",
          "React architecture",
          "For this Frontend Platform Engineer role, walk me through how you would design a reusable React component library that supports product velocity without creating API sprawl.",
        ),
        question(
          "fe-t2",
          "technical",
          "performance",
          "For a Frontend Platform Engineer, what performance signals would you monitor in a large React application, and how would those signals change your implementation choices?",
        ),
        question(
          "fe-t3",
          "technical",
          "accessibility",
          "For this Frontend Platform Engineer role, explain how you would bake accessibility checks into the development workflow for shared components.",
        ),
      ],
    },
  },
  {
    id: "ai-product-manager",
    title: "AI Product Manager",
    description:
      "Define AI product strategy, prioritize experiments, measure model-assisted workflows, and manage product risk with cross-functional teams.",
    competencies: [
      "customer discovery",
      "prioritization",
      "metrics",
      "AI evaluation",
      "stakeholder communication",
      "risk management",
    ],
    questionPack: {
      behavioral: [
        question(
          "pm-b1",
          "behavioral",
          "customer discovery",
          "For this AI Product Manager role, describe a discovery process you would use before committing engineering time to an AI-powered feature.",
        ),
        question(
          "pm-b2",
          "behavioral",
          "stakeholder communication",
          "As an AI Product Manager, tell me about a time you aligned engineering, design, legal, or go-to-market partners around an ambiguous product decision.",
        ),
        question(
          "pm-b3",
          "behavioral",
          "risk management",
          "For this AI Product Manager role, how would you communicate product risks when a model behaves well in demos but inconsistently in production-like tests?",
        ),
      ],
      technical: [
        question(
          "pm-t1",
          "technical",
          "metrics",
          "For this AI Product Manager role, define the activation, quality, and guardrail metrics you would use for an AI assistant workflow.",
        ),
        question(
          "pm-t2",
          "technical",
          "AI evaluation",
          "As an AI Product Manager, how would you design an evaluation plan that combines offline model quality checks with real user outcome metrics?",
        ),
        question(
          "pm-t3",
          "technical",
          "prioritization",
          "For this AI Product Manager role, explain how you would prioritize between improving model quality, reducing latency, and shipping a requested workflow.",
        ),
      ],
    },
  },
  {
    id: "data-analyst",
    title: "Data Analyst",
    description:
      "Analyze product and business data, write reliable SQL, communicate insights, and partner with teams to improve decision quality.",
    competencies: [
      "SQL",
      "experimentation",
      "data quality",
      "storytelling",
      "statistics",
      "business partnership",
    ],
    questionPack: {
      behavioral: [
        question(
          "da-b1",
          "behavioral",
          "business partnership",
          "For this Data Analyst role, tell me about how you would partner with a product team when their initial data request is too vague to answer directly.",
        ),
        question(
          "da-b2",
          "behavioral",
          "storytelling",
          "As a Data Analyst, describe a time you turned a complex analysis into a clear recommendation for non-technical stakeholders.",
        ),
        question(
          "da-b3",
          "behavioral",
          "data quality",
          "For this Data Analyst role, how would you handle pressure to share a metric when you suspect the underlying data is incomplete or biased?",
        ),
      ],
      technical: [
        question(
          "da-t1",
          "technical",
          "SQL",
          "For this Data Analyst role, walk me through how you would write and validate a SQL analysis that compares retention across two user cohorts.",
        ),
        question(
          "da-t2",
          "technical",
          "experimentation",
          "As a Data Analyst, explain how you would evaluate whether an experiment result is statistically meaningful and practically important.",
        ),
        question(
          "da-t3",
          "technical",
          "statistics",
          "For this Data Analyst role, how would you explain confidence intervals or uncertainty to a stakeholder who wants a simple yes-or-no answer?",
        ),
      ],
    },
  },
];

export function getJobById(jobId: string): Job | undefined {
  return JOBS.find((job) => job.id === jobId);
}

export function getAllQuestionTemplates(job: Job): QuestionTemplate[] {
  return [...job.questionPack.behavioral, ...job.questionPack.technical];
}
