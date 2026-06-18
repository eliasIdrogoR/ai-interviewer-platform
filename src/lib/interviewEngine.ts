import { getAllQuestionTemplates } from "./jobs";
import type {
  Evaluation,
  InterviewMetrics,
  InterviewQuestion,
  InterviewSession,
  InterviewTurn,
  InterviewerState,
  Job,
  NextQuestionResult,
  QuestionCategory,
  QuestionTemplate,
  RubricSignal,
} from "./types";

export const MIN_QUESTIONS = 6;
export const REQUIRED_FOLLOW_UPS = 2;

const FOLLOW_UP_QUESTION_NUMBERS = new Set([3, 5]);
const BASE_QUESTION_PLAN: Record<number, QuestionCategory> = {
  1: "behavioral",
  2: "technical",
  4: "technical",
  6: "behavioral",
};

const STOP_WORDS = new Set([
  "about",
  "after",
  "also",
  "because",
  "been",
  "before",
  "being",
  "could",
  "from",
  "have",
  "into",
  "that",
  "their",
  "there",
  "these",
  "they",
  "this",
  "through",
  "using",
  "were",
  "when",
  "where",
  "which",
  "with",
  "would",
]);

const COMPETENCY_KEYWORDS: Record<string, string[]> = {
  "React architecture": ["react", "component", "components", "hooks", "state", "frontend", "architecture"],
  accessibility: ["accessibility", "a11y", "screen reader", "keyboard", "wcag", "contrast", "semantic"],
  performance: ["performance", "latency", "bundle", "render", "memo", "web vitals", "profiling"],
  testing: ["test", "tests", "testing", "unit", "integration", "e2e", "coverage", "playwright", "vitest"],
  collaboration: ["collaboration", "partner", "stakeholder", "teams", "alignment", "adoption", "shared"],
  "systems thinking": ["system", "systems", "trade-off", "tradeoff", "architecture", "simplify", "scalable"],
  "customer discovery": ["customer", "discovery", "interview", "research", "problem", "pain", "user"],
  prioritization: ["prioritize", "prioritization", "priority", "roadmap", "impact", "effort", "trade-off"],
  metrics: ["metric", "metrics", "kpi", "activation", "retention", "conversion", "guardrail"],
  "AI evaluation": ["evaluation", "eval", "model", "quality", "offline", "human", "prompt", "llm"],
  "stakeholder communication": ["stakeholder", "communication", "align", "narrative", "executive", "legal", "sales"],
  "risk management": ["risk", "guardrail", "safety", "privacy", "compliance", "rollback", "failure"],
  SQL: ["sql", "query", "join", "cohort", "window", "table", "warehouse"],
  experimentation: ["experiment", "ab test", "a/b", "hypothesis", "control", "variant", "p-value"],
  "data quality": ["quality", "missing", "bias", "lineage", "validation", "anomaly", "source"],
  storytelling: ["story", "storytelling", "recommendation", "visualization", "insight", "narrative"],
  statistics: ["statistics", "statistical", "confidence", "uncertainty", "interval", "significance"],
  "business partnership": ["business", "partner", "stakeholder", "decision", "product", "recommendation"],
};

export function createInterviewSession(jobId: string, now: Date = new Date()): InterviewSession {
  return {
    id: createId("session"),
    jobId,
    startedAt: now.toISOString(),
    status: "in_progress",
    turns: [],
    metrics: {
      durationSeconds: 0,
      talkRatio: 0,
      topicCoverage: 0,
      scoreTrend: [],
    },
  };
}

export function createInterviewTurn(
  question: InterviewQuestion,
  answerText: string,
  timestamp: string = new Date().toISOString(),
): InterviewTurn {
  return {
    questionId: question.questionId,
    questionText: question.questionText,
    answerText: answerText.trim(),
    isFollowUp: question.isFollowUp,
    basedOnTurnId: question.basedOnTurnId,
    timestamp,
  };
}

export function generateNextQuestion(job: Job, session: InterviewSession): NextQuestionResult {
  const answeredCount = session.turns.length;
  const nextQuestionNumber = answeredCount + 1;

  if (answeredCount >= MIN_QUESTIONS) {
    return {
      question: null,
      isComplete: true,
      state: buildInterviewerState(
        job,
        session.turns,
        MIN_QUESTIONS,
        "Minimum interview depth has been reached; generating the final evaluation next.",
      ),
    };
  }

  if (FOLLOW_UP_QUESTION_NUMBERS.has(nextQuestionNumber)) {
    const targetTurn = session.turns[session.turns.length - 1];
    if (targetTurn) {
      const question = buildFollowUpQuestion(job, session, targetTurn, nextQuestionNumber);
      return {
        question,
        isComplete: false,
        state: buildInterviewerState(
          job,
          session.turns,
          nextQuestionNumber,
          `Follow-up selected because the candidate just discussed "${extractAnswerSignal(
            targetTurn.answerText,
          )}", which needs more concrete evidence for ${question.competency}.`,
        ),
      };
    }
  }

  const category = BASE_QUESTION_PLAN[nextQuestionNumber] ?? "behavioral";
  const template = selectUnusedTemplate(job, session.turns, category);
  const question = buildBaseQuestion(template);

  return {
    question,
    isComplete: false,
    state: buildInterviewerState(
      job,
      session.turns,
      nextQuestionNumber,
      `Base ${category} question selected to gather evidence for ${template.competency} in the ${job.title} role.`,
    ),
  };
}

export function buildEvaluation(job: Job, turns: InterviewTurn[]): Evaluation {
  const state = buildInterviewerState(
    job,
    turns,
    Math.min(turns.length + 1, MIN_QUESTIONS),
    "Evaluation generated from the completed transcript.",
  );
  const answerWordCounts = turns.map((turn) => countWords(turn.answerText));
  const averageAnswerLength = average(answerWordCounts);
  const shortAnswers = answerWordCounts.filter((count) => count < 18).length;
  const followUpsAnswered = turns.filter((turn) => turn.isFollowUp && countWords(turn.answerText) >= 12).length;
  const coverageRatio = job.competencies.length === 0 ? 0 : state.topicsCovered.length / job.competencies.length;
  const skillRatio = job.competencies.length === 0 ? 0 : state.skillsDetected.length / job.competencies.length;
  const score = clamp(
    Math.round(45 + coverageRatio * 20 + skillRatio * 20 + Math.min(averageAnswerLength, 70) * 0.15 + followUpsAnswered * 4 - shortAnswers * 3),
    30,
    95,
  );

  const strengths = state.skillsDetected.slice(0, 3).map((skill) => `Shows evidence of ${skill}.`);
  if (followUpsAnswered >= REQUIRED_FOLLOW_UPS) {
    strengths.push("Provided enough detail on follow-up questions to support deeper probing.");
  }
  if (strengths.length === 0 && turns.length >= MIN_QUESTIONS) {
    strengths.push("Completed the full interview flow and provided evaluable responses.");
  }

  const concerns = state.gaps.slice(0, 3).map((gap) => `Limited evidence for ${gap}.`);
  if (shortAnswers > 0) {
    concerns.push(`${shortAnswers} answer${shortAnswers === 1 ? " was" : "s were"} short and may need more concrete examples.`);
  }
  if (concerns.length === 0) {
    concerns.push("No major concerns detected in the deterministic rubric; human review is still recommended.");
  }

  return {
    strengths,
    concerns,
    overallScore: score,
    roleFitSummary: `${score >= 75 ? "Strong" : score >= 60 ? "Moderate" : "Developing"} signal for ${job.title}. The transcript covers ${state.topicsCovered.length} of ${job.competencies.length} target competencies, with strongest evidence around ${state.skillsDetected.slice(0, 2).join(" and ") || "general communication"}.`,
  };
}

export function calculateMetrics(
  job: Job,
  session: Pick<InterviewSession, "startedAt" | "endedAt" | "turns" | "evaluation">,
): InterviewMetrics {
  const interviewWords = session.turns.reduce((total, turn) => total + countWords(turn.questionText), 0);
  const candidateWords = session.turns.reduce((total, turn) => total + countWords(turn.answerText), 0);
  const totalWords = interviewWords + candidateWords;
  const state = buildInterviewerState(job, session.turns, Math.min(session.turns.length + 1, MIN_QUESTIONS), "Metric calculation.");
  const start = Date.parse(session.startedAt);
  const end = session.endedAt ? Date.parse(session.endedAt) : Date.now();

  return {
    durationSeconds: Number.isFinite(start) && Number.isFinite(end) ? Math.max(0, Math.round((end - start) / 1000)) : 0,
    talkRatio: totalWords === 0 ? 0 : roundTo(candidateWords / totalWords, 2),
    topicCoverage: job.competencies.length === 0 ? 0 : roundTo(state.topicsCovered.length / job.competencies.length, 2),
    scoreTrend: session.turns.map((_, index) => buildEvaluation(job, session.turns.slice(0, index + 1)).overallScore),
  };
}

export function buildInterviewerState(
  job: Job,
  turns: InterviewTurn[],
  currentQuestionNumber: number,
  rationaleForNextQuestion: string,
): InterviewerState {
  const skillsDetected = detectSkills(job, turns.map((turn) => turn.answerText).join(" "));
  const topicsCovered = unique(
    turns
      .map((turn) => getCompetencyForTurn(job, turns, turn))
      .filter((competency): competency is string => Boolean(competency)),
  );
  const observed = new Set([...skillsDetected, ...topicsCovered]);
  const gaps = job.competencies.filter((competency) => !observed.has(competency));
  const rubricSignals: RubricSignal[] = job.competencies.map((competency) => ({
    competency,
    status: observed.has(competency) ? "observed" : "gap",
    evidence: observed.has(competency)
      ? buildEvidenceSummary(competency, turns)
      : "No clear transcript evidence yet.",
  }));

  return {
    skillsDetected,
    topicsCovered,
    gaps,
    currentQuestionNumber,
    rationaleForNextQuestion,
    rubricSignals,
  };
}

export function detectSkills(job: Job, text: string): string[] {
  const normalized = normalize(text);
  return job.competencies.filter((competency) => {
    const keywords = COMPETENCY_KEYWORDS[competency] ?? [competency];
    return keywords.some((keyword) => normalized.includes(normalize(keyword)));
  });
}

export function getCompetencyForTurn(
  job: Job,
  turns: InterviewTurn[],
  turn: InterviewTurn,
): string | undefined {
  const template = getTemplateFromQuestionId(job, turn.questionId);
  if (template) {
    return template.competency;
  }

  if (turn.basedOnTurnId) {
    const sourceTurn = turns.find((candidate) => candidate.questionId === turn.basedOnTurnId);
    if (sourceTurn) {
      return getCompetencyForTurn(job, turns, sourceTurn);
    }
  }

  const questionText = normalize(turn.questionText);
  return job.competencies.find((competency) => questionText.includes(normalize(competency)));
}

function buildBaseQuestion(template: QuestionTemplate): InterviewQuestion {
  return {
    questionId: `q:${template.id}`,
    questionText: template.prompt,
    category: template.category,
    competency: template.competency,
    isFollowUp: false,
  };
}

function buildFollowUpQuestion(
  job: Job,
  session: InterviewSession,
  targetTurn: InterviewTurn,
  questionNumber: number,
): InterviewQuestion {
  const targetCompetency = getCompetencyForTurn(job, session.turns, targetTurn) ?? job.competencies[0] ?? "role fit";
  const answerSignal = extractAnswerSignal(targetTurn.answerText);
  const questionText = `You mentioned "${answerSignal}" in your previous answer. For the ${job.title} role, can you give a specific example, trade-off, or measurable outcome that shows your depth in ${targetCompetency}?`;

  return {
    questionId: `followup:${questionNumber}:${targetTurn.questionId}`,
    questionText,
    category: targetTurn.questionId.startsWith("q:")
      ? (getTemplateFromQuestionId(job, targetTurn.questionId)?.category ?? "behavioral")
      : "behavioral",
    competency: targetCompetency,
    isFollowUp: true,
    basedOnTurnId: targetTurn.questionId,
  };
}

function selectUnusedTemplate(job: Job, turns: InterviewTurn[], category: QuestionCategory): QuestionTemplate {
  const usedTemplateIds = new Set(
    turns
      .map((turn) => (turn.questionId.startsWith("q:") ? turn.questionId.slice(2) : undefined))
      .filter((id): id is string => Boolean(id)),
  );
  const categoryTemplates = job.questionPack[category];
  const template = categoryTemplates.find((candidate) => !usedTemplateIds.has(candidate.id));

  if (template) {
    return template;
  }

  return categoryTemplates[0] ?? getAllQuestionTemplates(job)[0];
}

function getTemplateFromQuestionId(job: Job, questionId: string): QuestionTemplate | undefined {
  if (!questionId.startsWith("q:")) {
    return undefined;
  }

  const templateId = questionId.slice(2);
  return getAllQuestionTemplates(job).find((template) => template.id === templateId);
}

function extractAnswerSignal(answerText: string): string {
  const words = answerText
    .split(/\s+/)
    .map((word) => word.replace(/[^a-zA-Z0-9/-]/g, ""))
    .filter((word) => word.length > 3 && !STOP_WORDS.has(word.toLowerCase()));

  const signal = words.slice(0, 6).join(" ").trim();
  if (signal.length > 0) {
    return signal;
  }

  return "that prior approach";
}

function buildEvidenceSummary(competency: string, turns: InterviewTurn[]): string {
  const matchingTurn = turns.find(
    (turn) => normalize(turn.questionText).includes(normalize(competency)) || normalize(turn.answerText).includes(normalize(competency)),
  );

  if (!matchingTurn) {
    return "Observed through related interview coverage.";
  }

  return `Evidence from answer: "${truncate(matchingTurn.answerText, 110)}"`;
}

function createId(prefix: string): string {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return `${prefix}-${crypto.randomUUID()}`;
  }

  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}

function countWords(text: string): number {
  return text.trim().length === 0 ? 0 : text.trim().split(/\s+/).length;
}

function average(values: number[]): number {
  if (values.length === 0) {
    return 0;
  }

  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function normalize(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
}

function roundTo(value: number, digits: number): number {
  const factor = 10 ** digits;
  return Math.round(value * factor) / factor;
}

function truncate(value: string, maxLength: number): string {
  if (value.length <= maxLength) {
    return value;
  }

  return `${value.slice(0, maxLength - 1)}…`;
}

function unique(values: string[]): string[] {
  return Array.from(new Set(values));
}
