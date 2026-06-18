import { afterEach, describe, expect, it, vi } from "vitest";
import { POST } from "./route";

describe("/api/interview", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    delete process.env.OPENAI_API_KEY;
    delete process.env.OPENAI_MODEL;
  });

  it("keeps an LLM rewrite while enforcing role grounding when the model response is generic", async () => {
    process.env.OPENAI_API_KEY = "test-key";
    vi.stubGlobal(
      "fetch",
      vi.fn(async () =>
        new Response(
          JSON.stringify({
            choices: [
              {
                message: {
                  content: JSON.stringify({
                    questionText: "Can you share a concrete launch example with measurable impact?",
                    rationaleForNextQuestion: "Probe for specific evidence and outcomes.",
                  }),
                },
              },
            ],
          }),
          { status: 200, headers: { "content-type": "application/json" } },
        ),
      ),
    );

    const response = await POST(
      new Request("https://example.test/api/interview", {
        method: "POST",
        body: JSON.stringify({
          action: "nextQuestion",
          jobId: "frontend-platform-engineer",
          session: {
            id: "session-test",
            jobId: "frontend-platform-engineer",
            startedAt: "2026-01-01T00:00:00.000Z",
            status: "in_progress",
            turns: [
              {
                questionId: "q:fe-b1",
                questionText: "For the Frontend Platform Engineer role, describe cross-team influence.",
                answerText: "I used RFCs and adoption metrics to align teams.",
                isFollowUp: false,
                timestamp: "2026-01-01T00:01:00.000Z",
              },
            ],
            metrics: {
              durationSeconds: 60,
              talkRatio: 0.5,
              topicCoverage: 0.1,
              scoreTrend: [],
            },
          },
        }),
      }),
    );

    const body = await response.json();

    expect(body.mode).toBe("llm");
    expect(body.question.questionText).toContain("Can you share a concrete launch example");
    expect(body.question.questionText).toContain("Frontend Platform Engineer");
  });
});
