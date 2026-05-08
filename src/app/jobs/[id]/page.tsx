"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import { StatusBadge } from "@/components/status-badge";
import { JobMetadata } from "@/components/job-metadata";
import { TranscriptViewer } from "@/components/transcript-viewer";
import { JobLogViewer } from "@/components/job-log-viewer";
import { EditSuite } from "@/components/edit-suite";
import { ColdOpenSuite } from "@/components/cold-open-suite";

interface JobData {
  id: number;
  status: string;
  originalFilename: string;
  error: string | null;
  language: string | null;
  durationSeconds: number | null;
  processingSeconds: number | null;
  fileSizeBytes: number | null;
  createdAt: string;
  startedAt: string | null;
  completedAt: string | null;
}

export default function JobPage() {
  const params = useParams();
  const jobId = Number(params.id);
  const [job, setJob] = useState<JobData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    async function load() {
      try {
        const res = await fetch(`/api/jobs/${jobId}`);
        if (!res.ok) {
          setError("Job not found");
          return;
        }
        const data = await res.json();
        setJob(data.job);
      } catch {
        setError("Failed to load job");
      } finally {
        setLoading(false);
      }
    }
    load();

    const interval = setInterval(async () => {
      try {
        const res = await fetch(`/api/jobs/${jobId}`);
        if (res.ok) {
          const data = await res.json();
          setJob(data.job);
        }
      } catch { /* ignore */ }
    }, 5000);

    return () => clearInterval(interval);
  }, [jobId]);

  if (loading)
    return (
      <p className="text-[10px] text-muted-foreground uppercase tracking-[0.14em]">
        Loading...
      </p>
    );
  if (error)
    return (
      <p className="text-[10px] text-error uppercase tracking-[0.14em]">{error}</p>
    );
  if (!job) return null;

  return (
    <div className="space-y-6">
      <Link
        href="/"
        data-slot="bracket-btn"
        className="text-[10px] font-bold uppercase tracking-[0.14em] text-muted-foreground hover:text-accent transition-colors"
      >
        Dashboard
      </Link>

      <div className="flex items-center gap-3">
        <h1 className="text-xs font-bold uppercase tracking-[0.08em] truncate">
          {job.originalFilename}
        </h1>
        <StatusBadge status={job.status} />
      </div>

      <div className="border border-border bg-card p-4">
        <JobMetadata job={job} />
      </div>

      {job.error && (
        <div className="border border-error/30 bg-error/5 p-4">
          <p className="text-[10px] font-bold text-error uppercase tracking-[0.14em]">
            Error
          </p>
          <p className="text-xs text-error tracking-[0.04em] mt-1">{job.error}</p>
        </div>
      )}

      {job.status === "completed" && <ColdOpenSuite jobId={job.id} />}

      {job.status === "completed" && <EditSuite jobId={job.id} />}

      {job.status === "completed" && <TranscriptViewer jobId={job.id} />}

      <JobLogViewer
        jobId={job.id}
        isActive={job.status === "processing" || job.status === "pending"}
      />
    </div>
  );
}
