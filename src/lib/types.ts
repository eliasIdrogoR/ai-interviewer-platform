export type InterviewStatus = "in_progress" | "completed";

export type QuestionCategory = "behavioral" | "technical";

export type RubricStatus = "observed" | "gap";

export interface QuestionTemplate {
  id: string;
  category: QuestionCategory;
  competency: string;
  prompt: string;
}

export interface QuestionPack {
  behavioral: QuestionTemplate[];
  technical: QuestionTemplate[];
}

export interface Job {
  id: string;
  title: string;
  description: string;
  competencies: string[];
  questionPack: QuestionPack;
}

export interface InterviewTurn {
  questionId: string;
  questionText: string;
  answerText: string;
  isFollowUp: boolean;
  basedOnTurnId?: string;
  timestamp: string;
}

export interface Evaluation {
  strengths: string[];
  concerns: string[];
  overallScore: number;
  roleFitSummary: string;
}

export interface InterviewMetrics {
  durationSeconds: number;
  talkRatio: number;
  topicCoverage: number;
  scoreTrend: number[];
}

export interface RubricSignal {
  competency: string;
  status: RubricStatus;
  evidence: string;
}

export interface InterviewerState {
  skillsDetected: string[];
  topicsCovered: string[];
  gaps: string[];
  currentQuestionNumber: number;
  rationaleForNextQuestion: string;
  rubricSignals: RubricSignal[];
}

export interface InterviewSession {
  id: string;
  jobId: string;
  startedAt: string;
  endedAt?: string;
  status: InterviewStatus;
  turns: InterviewTurn[];
  evaluation?: Evaluation;
  metrics: InterviewMetrics;
}

export interface InterviewQuestion {
  questionId: string;
  questionText: string;
  category: QuestionCategory;
  competency: string;
  isFollowUp: boolean;
  basedOnTurnId?: string;
}

export interface NextQuestionResult {
  question: InterviewQuestion | null;
  state: InterviewerState;
  isComplete: boolean;
}
