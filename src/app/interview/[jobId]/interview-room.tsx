"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  buildEvaluation,
  calculateMetrics,
  createInterviewSession,
  createInterviewTurn,
  generateNextQuestion,
  MIN_QUESTIONS,
} from "@/lib/interviewEngine";
import {
  clearActiveSessionId,
  getActiveSessionId,
  getInterviewSession,
  saveInterviewSession,
  setActiveSessionId,
} from "@/lib/sessionStore";
import type { Evaluation, InterviewSession, Job, NextQuestionResult } from "@/lib/types";

interface SpeechRecognitionEventLike extends Event {
  results: {
    length: number;
    [index: number]: {
      isFinal: boolean;
      [index: number]: {
        transcript: string;
      };
    };
  };
}

interface SpeechRecognitionErrorEventLike extends Event {
  error?: string;
}

interface SpeechRecognitionLike {
  continuous: boolean;
  interimResults: boolean;
  lang: string;
  onresult: ((event: SpeechRecognitionEventLike) => void) | null;
  onerror: ((event: SpeechRecognitionErrorEventLike) => void) | null;
  onend: (() => void) | null;
  start(): void;
  stop(): void;
}

type SpeechRecognitionConstructor = new () => SpeechRecognitionLike;

declare global {
  interface Window {
    SpeechRecognition?: SpeechRecognitionConstructor;
    webkitSpeechRecognition?: SpeechRecognitionConstructor;
  }
}

type ApiQuestionResponse = NextQuestionResult & { mode?: "llm" | "fallback" };
type ApiEvaluationResponse = { evaluation: Evaluation; mode?: "llm" | "fallback" };

export function InterviewRoom({ job }: { job: Job }) {
  const [session, setSession] = useState<InterviewSession | null>(null);
  const [questionResult, setQuestionResult] = useState<NextQuestionResult | null>(null);
  const [answerText, setAnswerText] = useState("");
  const [formError, setFormError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isListening, setIsListening] = useState(false);
  const [speechSupported, setSpeechSupported] = useState(false);
  const [voiceError, setVoiceError] = useState<string | null>(null);
  const [voicePlaybackEnabled, setVoicePlaybackEnabled] = useState(true);
  const [serverMode, setServerMode] = useState<"llm" | "fallback">("fallback");
  const [videoEnabled, setVideoEnabled] = useState(false);
  const [videoError, setVideoError] = useState<string | null>(null);
  const recognitionRef = useRef<SpeechRecognitionLike | null>(null);
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);

  const currentQuestion = questionResult?.question ?? null;
  const progressLabel = session
    ? `${Math.min(session.turns.length + 1, MIN_QUESTIONS)} of ${MIN_QUESTIONS}`
    : `1 of ${MIN_QUESTIONS}`;

  const fallbackQuestionResult = useMemo(() => {
    if (!session || session.status !== "in_progress") {
      return null;
    }

    return generateNextQuestion(job, session);
  }, [job, session]);

  const stopVideoStream = useCallback(() => {
    streamRef.current?.getTracks().forEach((track) => track.stop());
    streamRef.current = null;
  }, []);

  const finalizeSession = useCallback(
    async (candidateSession: InterviewSession) => {
      const endedAt = new Date().toISOString();
      const fallbackEvaluation = buildEvaluation(job, candidateSession.turns);
      let evaluation = fallbackEvaluation;
      let mode: "llm" | "fallback" = "fallback";

      try {
        const response = await fetch("/api/interview", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            action: "evaluate",
            jobId: job.id,
            session: { ...candidateSession, endedAt, status: "completed", evaluation: fallbackEvaluation },
          }),
        });

        if (response.ok) {
          const payload = (await response.json()) as ApiEvaluationResponse;
          if (isValidEvaluation(payload.evaluation)) {
            evaluation = payload.evaluation;
            mode = payload.mode ?? "fallback";
          }
        }
      } catch {
        mode = "fallback";
      }

      const completedSession: InterviewSession = {
        ...candidateSession,
        endedAt,
        status: "completed",
        evaluation,
        metrics: calculateMetrics(job, { ...candidateSession, endedAt, evaluation }),
      };

      saveInterviewSession(completedSession);
      clearActiveSessionId(job.id);
      setServerMode(mode);
      setQuestionResult(null);
      setSession(completedSession);
    },
    [job],
  );

  const startNewSession = useCallback(() => {
    const freshSession = createInterviewSession(job.id);
    freshSession.metrics = calculateMetrics(job, freshSession);
    saveInterviewSession(freshSession);
    setActiveSessionId(job.id, freshSession.id);
    setSession(freshSession);
    setAnswerText("");
    setFormError(null);
    setQuestionResult(generateNextQuestion(job, freshSession));
  }, [job]);

  useEffect(() => {
    const existingId = getActiveSessionId(job.id);
    const existingSession = existingId ? getInterviewSession(existingId) : undefined;

    if (existingSession?.status === "in_progress" && existingSession.jobId === job.id) {
      setSession(existingSession);
      setQuestionResult(generateNextQuestion(job, existingSession));
      return;
    }

    startNewSession();
  }, [job, startNewSession]);

  useEffect(() => {
    const Recognition = window.SpeechRecognition ?? window.webkitSpeechRecognition;
    setSpeechSupported(Boolean(Recognition));
  }, []);

  useEffect(() => {
    if (!session || session.status !== "in_progress") {
      return;
    }

    const fallback = fallbackQuestionResult ?? generateNextQuestion(job, session);
    setQuestionResult(fallback);

    if (!fallback.question) {
      void finalizeSession(session);
      return;
    }

    const controller = new AbortController();

    async function loadServerQuestion() {
      try {
        const response = await fetch("/api/interview", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          signal: controller.signal,
          body: JSON.stringify({ action: "nextQuestion", jobId: job.id, session }),
        });

        if (!response.ok) {
          return;
        }

        const payload = (await response.json()) as ApiQuestionResponse;
        if (payload.question) {
          setQuestionResult(payload);
          setServerMode(payload.mode ?? "fallback");
        }
      } catch {
        setServerMode("fallback");
      }
    }

    void loadServerQuestion();

    return () => controller.abort();
  }, [fallbackQuestionResult, finalizeSession, job, session]);

  useEffect(() => {
    if (!voicePlaybackEnabled || !currentQuestion || typeof window === "undefined" || !("speechSynthesis" in window)) {
      return;
    }

    window.speechSynthesis.cancel();
    const utterance = new SpeechSynthesisUtterance(currentQuestion.questionText);
    utterance.rate = 0.95;
    utterance.pitch = 1;
    window.speechSynthesis.speak(utterance);

    return () => window.speechSynthesis.cancel();
  }, [currentQuestion, voicePlaybackEnabled]);

  useEffect(() => {
    return () => {
      recognitionRef.current?.stop();
      stopVideoStream();
    };
  }, [stopVideoStream]);

  useEffect(() => {
    if (videoRef.current && streamRef.current) {
      videoRef.current.srcObject = streamRef.current;
    }
  }, [videoEnabled]);

  async function submitAnswer() {
    const trimmedAnswer = answerText.trim();
    setFormError(null);

    if (!session || session.status !== "in_progress") {
      return;
    }

    if (!currentQuestion) {
      setFormError("The next question is still loading. Try again in a moment.");
      return;
    }

    if (trimmedAnswer.length === 0) {
      setFormError("Please answer before moving to the next question.");
      return;
    }

    setIsSubmitting(true);
    recognitionRef.current?.stop();

    const updatedSession: InterviewSession = {
      ...session,
      turns: [...session.turns, createInterviewTurn(currentQuestion, trimmedAnswer)],
    };
    updatedSession.metrics = calculateMetrics(job, updatedSession);

    saveInterviewSession(updatedSession);
    setSession(updatedSession);
    setAnswerText("");

    if (updatedSession.turns.length >= MIN_QUESTIONS) {
      await finalizeSession(updatedSession);
    }

    setIsSubmitting(false);
  }

  function startListening() {
    const Recognition = window.SpeechRecognition ?? window.webkitSpeechRecognition;

    if (!Recognition) {
      setVoiceError("Speech recognition is unavailable in this browser. Use the typed answer box instead.");
      return;
    }

    try {
      recognitionRef.current?.stop();
      const recognition = new Recognition();
      recognition.continuous = false;
      recognition.interimResults = true;
      recognition.lang = "en-US";
      recognition.onresult = (event) => {
        let transcript = "";
        for (let index = 0; index < event.results.length; index += 1) {
          transcript += event.results[index][0].transcript;
        }
        setAnswerText(transcript.trim());
      };
      recognition.onerror = (event) => {
        const reason = event.error === "not-allowed" ? "Microphone permission was denied." : "Speech recognition stopped unexpectedly.";
        setVoiceError(`${reason} You can continue with typed input.`);
        setIsListening(false);
      };
      recognition.onend = () => setIsListening(false);
      recognitionRef.current = recognition;
      setVoiceError(null);
      setIsListening(true);
      recognition.start();
    } catch {
      setVoiceError("Could not start microphone capture. Use typed input to continue.");
      setIsListening(false);
    }
  }

  function stopListening() {
    recognitionRef.current?.stop();
    setIsListening(false);
  }

  async function startVideo() {
    setVideoError(null);

    if (!navigator.mediaDevices?.getUserMedia) {
      setVideoError("Camera access is unavailable in this browser.");
      return;
    }

    try {
      const stream = await navigator.mediaDevices.getUserMedia({ video: true, audio: false });
      streamRef.current = stream;
      setVideoEnabled(true);
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
      }
    } catch {
      setVideoError("Camera permission was denied or no camera is available.");
    }
  }

  function stopVideo() {
    stopVideoStream();
    setVideoEnabled(false);
  }


  if (!session) {
    return (
      <main className="page-shell">
        <div className="container card card-stack">
          <p className="eyebrow">Preparing room</p>
          <h1>Loading interview…</h1>
        </div>
      </main>
    );
  }

  return (
    <main className="page-shell">
      <div className="container">
        <nav className="navbar" aria-label="Interview navigation">
          <Link href="/" className="brand">
            <span className="brand-mark">AI</span>
            <span>{job.title}</span>
          </Link>
          <div className="nav-links">
            <Link href="/sessions" className="secondary-button">
              History
            </Link>
            <button type="button" className="danger-button" onClick={startNewSession}>
              Start over
            </button>
          </div>
        </nav>

        {session.status === "completed" ? (
          <CompletedSession job={job} session={session} serverMode={serverMode} onRestart={startNewSession} />
        ) : (
          <section className="app-grid" aria-label="Interview room">
            <div className="card card-stack question-card">
              <div className="badge-row">
                <span className="badge accent">Question {progressLabel}</span>
                <span className="badge">{currentQuestion?.category ?? "loading"}</span>
                <span className="badge">{currentQuestion?.competency ?? "rubric"}</span>
                <span className={serverMode === "llm" ? "badge success" : "badge warn"}>
                  {serverMode === "llm" ? "Server LLM enhanced" : "Deterministic fallback"}
                </span>
              </div>

              <div>
                <p className="eyebrow">AI interviewer</p>
                <p className="question-text">{currentQuestion?.questionText ?? "Preparing the next question…"}</p>
              </div>

              {videoEnabled ? (
                <div className="video-frame" aria-label="Optional video preview">
                  <video ref={videoRef} autoPlay muted playsInline />
                </div>
              ) : null}

              <div className="answer-tools">
                <div className="action-row">
                  {!isListening ? (
                    <button type="button" className="button" onClick={startListening} disabled={!speechSupported}>
                      Start microphone
                    </button>
                  ) : (
                    <button type="button" className="danger-button" onClick={stopListening}>
                      Stop listening
                    </button>
                  )}
                  <button type="button" className="secondary-button" onClick={() => setVoicePlaybackEnabled((enabled) => !enabled)}>
                    {voicePlaybackEnabled ? "Disable" : "Enable"} question audio
                  </button>
                  {!videoEnabled ? (
                    <button type="button" className="secondary-button" onClick={startVideo}>
                      Start video mode
                    </button>
                  ) : (
                    <button type="button" className="secondary-button" onClick={stopVideo}>
                      Stop video
                    </button>
                  )}
                </div>

                <p className="status-line">
                  {speechSupported
                    ? isListening
                      ? "Listening… speak your answer, then review the captured text before submitting."
                      : "Voice input is available. Typed input remains available for corrections and fallback."
                    : "Speech recognition is unavailable here; use typed input to complete the interview."}
                </p>
                {voiceError ? <p className="error-line">{voiceError}</p> : null}
                {videoError ? <p className="error-line">{videoError}</p> : null}

                <label className="card-stack">
                  <span className="eyebrow">Candidate answer</span>
                  <textarea
                    value={answerText}
                    onChange={(event) => setAnswerText(event.target.value)}
                    placeholder="Speak into the microphone or type your answer here…"
                  />
                </label>

                {formError ? <p className="error-line">{formError}</p> : null}
                <div className="action-row">
                  <button type="button" className="button" onClick={submitAnswer} disabled={isSubmitting || !currentQuestion}>
                    {isSubmitting ? "Saving…" : session.turns.length + 1 >= MIN_QUESTIONS ? "Finish interview" : "Submit answer"}
                  </button>
                </div>
              </div>

              <Transcript turns={session.turns} compact />
            </div>

            <DecisionPanel result={questionResult ?? fallbackQuestionResult} job={job} />
          </section>
        )}
      </div>
    </main>
  );
}

function DecisionPanel({ result, job }: { result: NextQuestionResult | null; job: Job }) {
  const state = result?.state;

  return (
    <aside className="card decision-panel" aria-label="Interviewer decision panel">
      <div>
        <p className="eyebrow">Decision panel</p>
        <h2>Rubric signals</h2>
        <p className="muted small">The deterministic state explains what has been covered and why the next prompt was selected.</p>
      </div>

      <div className="card-stack">
        <h3>Next-question rationale</h3>
        <p className="muted">{state?.rationaleForNextQuestion ?? "Waiting for the first question."}</p>
      </div>

      <div className="card-stack">
        <h3>Skills detected</h3>
        <div className="badge-row">
          {(state?.skillsDetected.length ? state.skillsDetected : ["No explicit skills detected yet"]).map((skill) => (
            <span key={skill} className="badge success">
              {skill}
            </span>
          ))}
        </div>
      </div>

      <div className="card-stack">
        <h3>Topics covered</h3>
        <div className="badge-row">
          {(state?.topicsCovered.length ? state.topicsCovered : ["No completed answers yet"]).map((topic) => (
            <span key={topic} className="badge accent">
              {topic}
            </span>
          ))}
        </div>
      </div>

      <div className="card-stack">
        <h3>Gaps</h3>
        <div className="badge-row">
          {(state?.gaps.length ? state.gaps : job.competencies).map((gap) => (
            <span key={gap} className="badge warn">
              {gap}
            </span>
          ))}
        </div>
      </div>

      <ul className="signal-list" aria-label="Rubric signal details">
        {(state?.rubricSignals ?? []).map((signal) => (
          <li key={signal.competency} className="signal-item">
            <strong>{signal.competency}</strong>
            <span className={signal.status === "observed" ? "success-line" : "status-line"}>{signal.status}</span>
            <p className="muted small">{signal.evidence}</p>
          </li>
        ))}
      </ul>
    </aside>
  );
}

function CompletedSession({
  job,
  session,
  serverMode,
  onRestart,
}: {
  job: Job;
  session: InterviewSession;
  serverMode: "llm" | "fallback";
  onRestart: () => void;
}) {
  return (
    <section className="card card-stack" aria-labelledby="complete-title">
      <div className="badge-row">
        <span className="badge success">Completed</span>
        <span className="badge">{job.title}</span>
        <span className={serverMode === "llm" ? "badge success" : "badge warn"}>
          {serverMode === "llm" ? "Server LLM evaluation" : "Deterministic evaluation"}
        </span>
      </div>
      <div>
        <p className="eyebrow">End of interview</p>
        <h1 id="complete-title">Transcript and evaluation saved.</h1>
        <p className="lede">Review the full Q/A transcript below. You can replay this session from the history page.</p>
      </div>

      <div className="metrics-row">
        <Metric label="Score" value={`${session.evaluation?.overallScore ?? 0}/100`} />
        <Metric label="Duration" value={`${session.metrics.durationSeconds}s`} />
        <Metric label="Talk ratio" value={`${Math.round(session.metrics.talkRatio * 100)}%`} />
        <Metric label="Topic coverage" value={`${Math.round(session.metrics.topicCoverage * 100)}%`} />
      </div>

      <section className="card-stack" aria-labelledby="evaluation-title">
        <h2 id="evaluation-title">Structured evaluation</h2>
        <pre>{JSON.stringify(session.evaluation, null, 2)}</pre>
      </section>

      <Transcript turns={session.turns} />

      <div className="action-row">
        <Link href="/sessions" className="button">
          View session history
        </Link>
        <button type="button" className="secondary-button" onClick={onRestart}>
          Practice again
        </button>
      </div>
    </section>
  );
}

function Transcript({ turns, compact = false }: { turns: InterviewSession["turns"]; compact?: boolean }) {
  if (turns.length === 0) {
    return compact ? null : <p className="muted">No completed turns yet.</p>;
  }

  return (
    <section className="card-stack" aria-label="Transcript">
      <h2>{compact ? "Transcript so far" : "Full transcript"}</h2>
      <ol className="transcript-list">
        {turns.map((turn, index) => (
          <li key={`${turn.questionId}-${turn.timestamp}`} className="transcript-turn">
            <div className="badge-row">
              <span className="badge">Turn {index + 1}</span>
              {turn.isFollowUp ? <span className="badge accent">Follow-up</span> : null}
            </div>
            <div className="transcript-grid">
              <div>
                <strong>AI question</strong>
                <p>{turn.questionText}</p>
              </div>
              <div>
                <strong>Candidate answer</strong>
                <p>{turn.answerText}</p>
              </div>
            </div>
          </li>
        ))}
      </ol>
    </section>
  );
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div className="signal-item">
      <strong>{value}</strong>
      <span className="muted small">{label}</span>
    </div>
  );
}

function isValidEvaluation(value: unknown): value is Evaluation {
  if (!value || typeof value !== "object") {
    return false;
  }

  const candidate = value as Partial<Evaluation>;
  return (
    Array.isArray(candidate.strengths) &&
    Array.isArray(candidate.concerns) &&
    typeof candidate.overallScore === "number" &&
    typeof candidate.roleFitSummary === "string"
  );
}
