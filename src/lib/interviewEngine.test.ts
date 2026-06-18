import { describe, expect, it } from "vitest";
import { JOBS } from "./jobs";
import {
  buildEvaluation,
  createInterviewSession,
  createInterviewTurn,
  generateNextQuestion,
  MIN_QUESTIONS,
  REQUIRED_FOLLOW_UPS,
} from "./interviewEngine";
import type { InterviewSession, Job } from "./types";

describe("deterministic interview engine", () => {
  it("asks at least six questions, including at least two answer-dependent follow-ups", () => {
    const job = JOBS[0];
    const session = completeDeterministicInterview(job);

    expect(session.turns).toHaveLength(MIN_QUESTIONS);
    expect(session.turns.filter((turn) => turn.isFollowUp)).toHaveLength(REQUIRED_FOLLOW_UPS);
    expect(session.turns.filter((turn) => turn.isFollowUp).every((turn) => Boolean(turn.basedOnTurnId))).toBe(true);
  });

  it("keeps questions role-grounded and avoids duplicate question IDs", () => {
    const job = JOBS[1];
    const session = completeDeterministicInterview(job);
    const uniqueQuestionIds = new Set(session.turns.map((turn) => turn.questionId));

    expect(uniqueQuestionIds.size).toBe(session.turns.length);
    expect(session.turns.every((turn) => isRoleGrounded(turn.questionText, job))).toBe(true);
  });

  it("returns a valid evaluation shape based on the transcript", () => {
    const job = JOBS[2];
    const session = completeDeterministicInterview(job);
    const evaluation = buildEvaluation(job, session.turns);

    expect(evaluation.strengths.length).toBeGreaterThan(0);
    expect(evaluation.concerns.length).toBeGreaterThan(0);
    expect(evaluation.overallScore).toBeGreaterThanOrEqual(0);
    expect(evaluation.overallScore).toBeLessThanOrEqual(100);
    expect(evaluation.roleFitSummary).toContain(job.title);
  });
});

function completeDeterministicInterview(job: Job): InterviewSession {
  let session = createInterviewSession(job.id, new Date("2026-01-01T00:00:00.000Z"));

  for (let index = 0; index < MIN_QUESTIONS; index += 1) {
    const result = generateNextQuestion(job, session);
    expect(result.question).not.toBeNull();

    const question = result.question;
    if (!question) {
      throw new Error("Expected a question before interview completion.");
    }

    const answer = `I would use ${question.competency} for the ${job.title} role by describing the problem, the trade-off, the metric, and how I collaborated with stakeholders to validate the outcome.`;
    session = {
      ...session,
      turns: [...session.turns, createInterviewTurn(question, answer, `2026-01-01T00:0${index}:00.000Z`)],
    };
  }

  expect(generateNextQuestion(job, session).isComplete).toBe(true);
  return session;
}

function isRoleGrounded(questionText: string, job: Job): boolean {
  const normalizedQuestion = normalize(questionText);
  return (
    normalizedQuestion.includes(normalize(job.title)) ||
    job.competencies.some((competency) => normalizedQuestion.includes(normalize(competency)))
  );
}

function normalize(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
}
