import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { JOBS } from "./jobs";
import {
  buildEvaluation,
  calculateMetrics,
  createInterviewSession,
  createInterviewTurn,
  generateNextQuestion,
  MIN_QUESTIONS,
  REQUIRED_FOLLOW_UPS,
} from "./interviewEngine";
import type { InterviewSession, Job } from "./types";

describe("AI Interviewer Platform requirements", () => {
  it("ships at least three selectable jobs with descriptions and structured question packs", () => {
    expect(JOBS.length).toBeGreaterThanOrEqual(3);

    for (const job of JOBS) {
      expect(job.title.trim().length).toBeGreaterThan(0);
      expect(job.description.trim().length).toBeGreaterThan(0);
      expect(job.questionPack.behavioral.length).toBeGreaterThan(0);
      expect(job.questionPack.technical.length).toBeGreaterThan(0);
    }
  });

  it("runs a role-grounded six-question interview for every job with two prior-answer follow-ups", () => {
    for (const job of JOBS) {
      const session = completeInterview(job);
      const followUps = session.turns.filter((turn) => turn.isFollowUp);

      expect(session.turns.length).toBeGreaterThanOrEqual(MIN_QUESTIONS);
      expect(followUps.length).toBeGreaterThanOrEqual(REQUIRED_FOLLOW_UPS);
      expect(new Set(session.turns.map((turn) => turn.questionId)).size).toBe(session.turns.length);

      for (const turn of session.turns) {
        expect(isRoleGrounded(turn.questionText, job)).toBe(true);
      }

      expect(followUps[0].basedOnTurnId).toBe(session.turns[1].questionId);
      expect(followUps[0].questionText).toContain("AlphaSignal");
      expect(followUps[1].basedOnTurnId).toBe(session.turns[3].questionId);
      expect(followUps[1].questionText).toContain("BetaSignal");
    }
  });

  it("creates a saved-session-ready transcript, evaluation JSON, and replay metrics", () => {
    const job = JOBS[0];
    const inProgress = completeInterview(job);
    const evaluation = buildEvaluation(job, inProgress.turns);
    const completed: InterviewSession = {
      ...inProgress,
      status: "completed",
      endedAt: "2026-01-01T00:12:00.000Z",
      evaluation,
    };
    const metrics = calculateMetrics(job, completed);

    expect(completed.turns).toHaveLength(MIN_QUESTIONS);
    expect(completed.turns.every((turn) => turn.questionText && turn.answerText)).toBe(true);
    expect(evaluation).toEqual({
      strengths: expect.arrayContaining([expect.any(String)]),
      concerns: expect.arrayContaining([expect.any(String)]),
      overallScore: expect.any(Number),
      roleFitSummary: expect.stringContaining(job.title),
    });
    expect(evaluation.overallScore).toBeGreaterThanOrEqual(0);
    expect(evaluation.overallScore).toBeLessThanOrEqual(100);
    expect(metrics.durationSeconds).toBe(720);
    expect(metrics.talkRatio).toBeGreaterThan(0);
    expect(metrics.topicCoverage).toBeGreaterThan(0);
    expect(metrics.scoreTrend).toHaveLength(MIN_QUESTIONS);
  });

  it("keeps the lockfile portable for public hosted installs", () => {
    const lockfile = readFileSync(new URL("../../package-lock.json", import.meta.url), "utf8");

    expect(lockfile).not.toContain("applied-caas-gateway");
    expect(lockfile).not.toContain("/artifactory/api/npm/npm-public/");
  });
});

function completeInterview(job: Job): InterviewSession {
  let session = createInterviewSession(job.id, new Date("2026-01-01T00:00:00.000Z"));

  for (let index = 0; index < MIN_QUESTIONS; index += 1) {
    const result = generateNextQuestion(job, session);
    expect(result.question).not.toBeNull();

    if (!result.question) {
      throw new Error(`Expected question ${index + 1} for ${job.title}.`);
    }

    const answer = answerForTurn(job, index + 1);
    session = {
      ...session,
      turns: [...session.turns, createInterviewTurn(result.question, answer, `2026-01-01T00:0${index}:00.000Z`)],
    };
  }

  expect(generateNextQuestion(job, session).isComplete).toBe(true);
  return session;
}

function answerForTurn(job: Job, questionNumber: number): string {
  if (questionNumber === 2) {
    return `AlphaSignal ${job.id} measurable outcome decision. I would connect the selected role requirements to user evidence, explain the trade-off, and validate the result with stakeholders.`;
  }

  if (questionNumber === 4) {
    return `BetaSignal ${job.id} concrete trade-off metric. I would describe the implementation choice, the risk, the collaboration model, and the measured impact for the role.`;
  }

  return `For the ${job.title} role, I would use ${job.competencies.join(", ")} to explain the situation, action, outcome, trade-off, and validation plan in a concrete example.`;
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
