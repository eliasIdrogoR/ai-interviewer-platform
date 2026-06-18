import Link from "next/link";
import { JOBS, getJobById } from "@/lib/jobs";
import { InterviewRoom } from "./interview-room";

export function generateStaticParams() {
  return JOBS.map((job) => ({ jobId: job.id }));
}

export default async function InterviewPage({
  params,
}: {
  params: Promise<{ jobId: string }>;
}) {
  const { jobId } = await params;
  const job = getJobById(jobId);

  if (!job) {
    return (
      <main className="page-shell">
        <div className="container card card-stack">
          <p className="eyebrow">Unknown role</p>
          <h1>Interview room not found.</h1>
          <p className="muted">Choose one of the sample jobs to start a role-grounded interview.</p>
          <Link href="/" className="button">
            Back to jobs
          </Link>
        </div>
      </main>
    );
  }

  return <InterviewRoom job={job} />;
}
