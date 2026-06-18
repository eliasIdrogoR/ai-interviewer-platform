"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { JOBS, getJobById } from "@/lib/jobs";
import { readInterviewSessions } from "@/lib/sessionStore";
import type { InterviewSession } from "@/lib/types";

export function SessionHistory() {
  const [sessions, setSessions] = useState<InterviewSession[]>([]);
  const [selectedJobId, setSelectedJobId] = useState("all");
  const [selectedSessionId, setSelectedSessionId] = useState<string | null>(null);

  useEffect(() => {
    const storedSessions = readInterviewSessions();
    setSessions(storedSessions);
    setSelectedSessionId(storedSessions[0]?.id ?? null);
  }, []);

  const filteredSessions = useMemo(() => {
    if (selectedJobId === "all") {
      return sessions;
    }

    return sessions.filter((session) => session.jobId === selectedJobId);
  }, [selectedJobId, sessions]);

  const selectedSession = useMemo(() => {
    return filteredSessions.find((session) => session.id === selectedSessionId) ?? filteredSessions[0] ?? null;
  }, [filteredSessions, selectedSessionId]);

  const scoreTrend = filteredSessions
    .filter((session) => session.status === "completed" && session.evaluation)
    .slice()
    .sort((left, right) => left.startedAt.localeCompare(right.startedAt))
    .map((session) => session.evaluation?.overallScore ?? 0);

  return (
    <main className="page-shell">
      <div className="container">
        <nav className="navbar" aria-label="History navigation">
          <Link href="/" className="brand">
            <span className="brand-mark">AI</span>
            <span>Session history</span>
          </Link>
          <div className="nav-links">
            <Link href="/" className="secondary-button">
              Back to jobs
            </Link>
          </div>
        </nav>

        <section className="hero-card card-stack" aria-labelledby="history-title">
          <p className="eyebrow">Replay and analytics</p>
          <h1 id="history-title">Saved interview sessions.</h1>
          <p className="lede">
            Sessions are stored locally in this browser. Filter by role, replay the transcript, and compare score trends across completed interviews.
          </p>
        </section>

        <section className="history-layout" aria-label="Session history">
          <aside className="card card-stack">
            <div className="card-stack">
              <label className="card-stack">
                <span className="eyebrow">Filter by role</span>
                <select
                  value={selectedJobId}
                  onChange={(event) => {
                    setSelectedJobId(event.target.value);
                    setSelectedSessionId(null);
                  }}
                >
                  <option value="all">All roles</option>
                  {JOBS.map((job) => (
                    <option key={job.id} value={job.id}>
                      {job.title}
                    </option>
                  ))}
                </select>
              </label>

              <div className="metrics-row">
                <Metric label="Sessions" value={`${filteredSessions.length}`} />
                <Metric label="Completed" value={`${filteredSessions.filter((session) => session.status === "completed").length}`} />
                <Metric label="Avg. score" value={formatAverageScore(filteredSessions)} />
              </div>
            </div>

            <div className="card-stack">
              <h2>Score trend</h2>
              {scoreTrend.length > 0 ? (
                <p className="muted">{scoreTrend.map((score, index) => `#${index + 1}: ${score}`).join(" → ")}</p>
              ) : (
                <p className="muted">Complete an interview to populate score trend analytics.</p>
              )}
            </div>

            <ul className="session-list" aria-label="Saved sessions">
              {filteredSessions.map((session) => {
                const job = getJobById(session.jobId);
                const isActive = selectedSession?.id === session.id;
                return (
                  <li key={session.id}>
                    <button
                      type="button"
                      className={`session-item${isActive ? " active" : ""}`}
                      onClick={() => setSelectedSessionId(session.id)}
                    >
                      <strong>{job?.title ?? "Unknown role"}</strong>
                      <p className="muted small">{new Date(session.startedAt).toLocaleString()}</p>
                      <div className="badge-row">
                        <span className={session.status === "completed" ? "badge success" : "badge warn"}>{session.status}</span>
                        <span className="badge">{session.turns.length} turns</span>
                        {session.evaluation ? <span className="badge accent">{session.evaluation.overallScore}/100</span> : null}
                      </div>
                    </button>
                  </li>
                );
              })}
            </ul>

            {filteredSessions.length === 0 ? <p className="muted">No sessions match this filter yet.</p> : null}
          </aside>

          <section className="card card-stack" aria-label="Replay selected session">
            {selectedSession ? <ReplaySession session={selectedSession} /> : <EmptyReplay />}
          </section>
        </section>
      </div>
    </main>
  );
}

function ReplaySession({ session }: { session: InterviewSession }) {
  const job = getJobById(session.jobId);

  return (
    <>
      <div className="badge-row">
        <span className="badge">{job?.title ?? "Unknown role"}</span>
        <span className={session.status === "completed" ? "badge success" : "badge warn"}>{session.status}</span>
      </div>
      <div>
        <p className="eyebrow">Replay</p>
        <h2>{job?.title ?? "Interview"}</h2>
        <p className="muted">
          Started {new Date(session.startedAt).toLocaleString()}
          {session.endedAt ? ` · ended ${new Date(session.endedAt).toLocaleString()}` : ""}
        </p>
      </div>

      <div className="metrics-row">
        <Metric label="Duration" value={`${session.metrics.durationSeconds}s`} />
        <Metric label="Talk ratio" value={`${Math.round(session.metrics.talkRatio * 100)}%`} />
        <Metric label="Topic coverage" value={`${Math.round(session.metrics.topicCoverage * 100)}%`} />
        <Metric label="Score" value={session.evaluation ? `${session.evaluation.overallScore}/100` : "N/A"} />
      </div>

      {session.evaluation ? (
        <section className="card-stack" aria-labelledby="replay-evaluation-title">
          <h3 id="replay-evaluation-title">Evaluation</h3>
          <pre>{JSON.stringify(session.evaluation, null, 2)}</pre>
        </section>
      ) : (
        <p className="muted">This interview is still in progress and does not have a final evaluation yet.</p>
      )}

      <section className="card-stack" aria-labelledby="replay-transcript-title">
        <h3 id="replay-transcript-title">Transcript</h3>
        {session.turns.length === 0 ? (
          <p className="muted">No answers were submitted yet.</p>
        ) : (
          <ol className="transcript-list">
            {session.turns.map((turn, index) => (
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
        )}
      </section>
    </>
  );
}

function EmptyReplay() {
  return (
    <div className="card-stack">
      <p className="eyebrow">No replay selected</p>
      <h2>Complete an interview to view saved sessions.</h2>
      <Link href="/" className="button">
        Start an interview
      </Link>
    </div>
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

function formatAverageScore(sessions: InterviewSession[]): string {
  const scores = sessions
    .map((session) => session.evaluation?.overallScore)
    .filter((score): score is number => typeof score === "number");

  if (scores.length === 0) {
    return "N/A";
  }

  const average = scores.reduce((sum, score) => sum + score, 0) / scores.length;
  return `${Math.round(average)}/100`;
}
