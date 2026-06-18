import Link from "next/link";
import { JOBS } from "@/lib/jobs";

export default function Home() {
  return (
    <main className="page-shell">
      <div className="container">
        <nav className="navbar" aria-label="Primary navigation">
          <Link href="/" className="brand">
            <span className="brand-mark">AI</span>
            <span>Interviewer Platform</span>
          </Link>
          <div className="nav-links">
            <Link href="/sessions" className="secondary-button">
              Session history
            </Link>
          </div>
        </nav>

        <section className="hero" aria-labelledby="hero-title">
          <div className="hero-card">
            <p className="eyebrow">Voice-first interview practice</p>
            <h1 id="hero-title">Practice with a focused AI interviewer.</h1>
            <p className="lede">
              Select a role, answer by microphone where the browser supports it, and receive a saved transcript with a structured role-fit evaluation.
            </p>
          </div>

          <aside className="card card-stack" aria-label="How it works">
            <h2>Flow</h2>
            <p className="muted">Six role-grounded questions, including deterministic follow-ups based on what you just answered.</p>
            <div className="badge-row">
              <span className="badge accent">Voice input</span>
              <span className="badge accent">Typed fallback</span>
              <span className="badge accent">Local history</span>
            </div>
            <p className="small muted">
              Sessions are saved in this browser. If the deployed server is configured with an LLM key, question wording and evaluation can be enhanced server-side; otherwise the deterministic engine runs end-to-end.
            </p>
          </aside>
        </section>

        <section aria-labelledby="jobs-title">
          <p className="eyebrow">Sample jobs</p>
          <h2 id="jobs-title">Choose an interview room</h2>
          <div className="job-grid">
            {JOBS.map((job) => (
              <Link key={job.id} href={`/interview/${job.id}`} className="card job-card">
                <div className="card-stack">
                  <div>
                    <h3>{job.title}</h3>
                    <p className="muted">{job.description}</p>
                  </div>
                  <div className="badge-row" aria-label={`${job.title} competencies`}>
                    {job.competencies.slice(0, 4).map((competency) => (
                      <span key={competency} className="badge">
                        {competency}
                      </span>
                    ))}
                  </div>
                </div>
                <span className="button">Start interview</span>
              </Link>
            ))}
          </div>
        </section>
      </div>
    </main>
  );
}
