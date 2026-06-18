import { NextResponse } from "next/server";
import { getJobById } from "@/lib/jobs";
import { buildEvaluation, generateNextQuestion } from "@/lib/interviewEngine";
import type { Evaluation, InterviewSession, Job, NextQuestionResult } from "@/lib/types";

export const runtime = "nodejs";

type InterviewAction = "nextQuestion" | "evaluate";

interface InterviewRequestBody {
  action?: InterviewAction;
  jobId?: string;
  session?: InterviewSession;
}

interface ChatCompletionResponse {
  choices?: Array<{
    message?: {
      content?: string;
    };
  }>;
}

export async function POST(request: Request) {
  let body: InterviewRequestBody;

  try {
    body = (await request.json()) as InterviewRequestBody;
  } catch {
    return NextResponse.json({ error: "Invalid JSON request body." }, { status: 400 });
  }

  if (!body.jobId || !body.session || !body.action) {
    return NextResponse.json({ error: "Missing action, jobId, or session." }, { status: 400 });
  }

  const job = getJobById(body.jobId);
  if (!job) {
    return NextResponse.json({ error: "Unknown job." }, { status: 404 });
  }

  if (body.action === "nextQuestion") {
    const fallback = generateNextQuestion(job, body.session);
    const enhanced = await enhanceQuestionWithLlm(job, body.session, fallback);
    return NextResponse.json(enhanced);
  }

  const fallbackEvaluation = buildEvaluation(job, body.session.turns);
  const enhancedEvaluation = await enhanceEvaluationWithLlm(job, body.session, fallbackEvaluation);
  return NextResponse.json(enhancedEvaluation);
}

async function enhanceQuestionWithLlm(
  job: Job,
  session: InterviewSession,
  fallback: NextQuestionResult,
): Promise<NextQuestionResult & { mode: "llm" | "fallback" }> {
  const apiKey = process.env.OPENAI_API_KEY;

  if (!apiKey || !fallback.question) {
    return { ...fallback, mode: "fallback" };
  }

  const payload = await callOpenAIJson<{ questionText?: string; rationaleForNextQuestion?: string }>([
    {
      role: "system",
      content:
        "You are an interview-question rewriting assistant. Return compact JSON only. Preserve the deterministic metadata and constraints. Do not ask duplicate questions.",
    },
    {
      role: "user",
      content: JSON.stringify({
        task:
          "Rewrite the provided next interview question so it is natural, role-grounded, and directly informed by the transcript when it is a follow-up. Preserve intent and do not change question count or metadata.",
        job,
        transcript: session.turns,
        deterministicQuestion: fallback.question,
        deterministicRationale: fallback.state.rationaleForNextQuestion,
        requiredJsonShape: {
          questionText: "string",
          rationaleForNextQuestion: "string",
        },
      }),
    },
  ]);

  const questionText = payload?.questionText?.trim();
  const rationaleForNextQuestion = payload?.rationaleForNextQuestion?.trim();
  if (!questionText || isDuplicateQuestion(questionText, session)) {
    return { ...fallback, mode: "fallback" };
  }

  const groundedQuestionText = ensureRoleGroundedQuestion(questionText, job, fallback.question.competency);

  return {
    ...fallback,
    mode: "llm",
    question: {
      ...fallback.question,
      questionText: groundedQuestionText,
    },
    state: {
      ...fallback.state,
      rationaleForNextQuestion: rationaleForNextQuestion || fallback.state.rationaleForNextQuestion,
    },
  };
}

async function enhanceEvaluationWithLlm(
  job: Job,
  session: InterviewSession,
  fallbackEvaluation: Evaluation,
): Promise<{ evaluation: Evaluation; mode: "llm" | "fallback" }> {
  const apiKey = process.env.OPENAI_API_KEY;

  if (!apiKey) {
    return { evaluation: fallbackEvaluation, mode: "fallback" };
  }

  const payload = await callOpenAIJson<Evaluation>([
    {
      role: "system",
      content:
        "You are a structured interview evaluator. Return JSON only with strengths, concerns, overallScore, and roleFitSummary. Be evidence-based and concise.",
    },
    {
      role: "user",
      content: JSON.stringify({
        task: "Evaluate the candidate transcript for the selected role.",
        job,
        transcript: session.turns,
        fallbackEvaluation,
        requiredJsonShape: {
          strengths: ["string"],
          concerns: ["string"],
          overallScore: "number from 0 to 100",
          roleFitSummary: "string",
        },
      }),
    },
  ]);

  if (!isEvaluation(payload)) {
    return { evaluation: fallbackEvaluation, mode: "fallback" };
  }

  return {
    evaluation: {
      strengths: payload.strengths.slice(0, 5),
      concerns: payload.concerns.slice(0, 5),
      overallScore: Math.max(0, Math.min(100, Math.round(payload.overallScore))),
      roleFitSummary: payload.roleFitSummary,
    },
    mode: "llm",
  };
}

async function callOpenAIJson<T>(messages: Array<{ role: "system" | "user"; content: string }>): Promise<T | null> {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    return null;
  }

  try {
    const response = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: process.env.OPENAI_MODEL ?? "gpt-4o-mini",
        messages,
        response_format: { type: "json_object" },
        temperature: 0.2,
      }),
    });

    if (!response.ok) {
      return null;
    }

    const data = (await response.json()) as ChatCompletionResponse;
    const content = data.choices?.[0]?.message?.content;
    if (!content) {
      return null;
    }

    return parseJsonObject<T>(content);
  } catch {
    return null;
  }
}

function parseJsonObject<T>(content: string): T | null {
  try {
    return JSON.parse(content) as T;
  } catch {
    const match = content.match(/\{[\s\S]*\}/);
    if (!match) {
      return null;
    }

    try {
      return JSON.parse(match[0]) as T;
    } catch {
      return null;
    }
  }
}

function isDuplicateQuestion(questionText: string, session: InterviewSession): boolean {
  const normalizedQuestion = normalize(questionText);
  return session.turns.some((turn) => normalize(turn.questionText) === normalizedQuestion);
}

function isRoleGrounded(questionText: string, job: Job, competency: string): boolean {
  const normalizedQuestion = normalize(questionText);
  return normalizedQuestion.includes(normalize(job.title)) || normalizedQuestion.includes(normalize(competency));
}

function ensureRoleGroundedQuestion(questionText: string, job: Job, competency: string): string {
  if (isRoleGrounded(questionText, job, competency)) {
    return questionText;
  }

  return `${questionText} Please answer for the ${job.title} role, focusing on ${competency}.`;
}

function isEvaluation(value: unknown): value is Evaluation {
  if (!value || typeof value !== "object") {
    return false;
  }

  const candidate = value as Partial<Evaluation>;
  return (
    Array.isArray(candidate.strengths) &&
    candidate.strengths.every((item) => typeof item === "string") &&
    Array.isArray(candidate.concerns) &&
    candidate.concerns.every((item) => typeof item === "string") &&
    typeof candidate.overallScore === "number" &&
    typeof candidate.roleFitSummary === "string"
  );
}

function normalize(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
}
