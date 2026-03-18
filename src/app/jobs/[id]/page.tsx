"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import { StatusBadge } from "@/components/status-badge";
import { JobMetadata } from "@/components/job-metadata";
import { TranscriptViewer } from "@/components/transcript-viewer";

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

    // Poll while not completed
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

  if (loading) return <p className="text-muted text-sm">Loading...</p>;
  if (error) return <p className="text-error text-sm">{error}</p>;
  if (!job) return null;

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3">
        <Link href="/" className="text-muted hover:text-foreground text-sm">
          ← Dashboard
        </Link>
      </div>

      <div className="flex items-center gap-3">
        <h1 className="text-xl font-semibold truncate">
          {job.originalFilename}
        </h1>
        <StatusBadge status={job.status} />
      </div>

      <div className="border border-border rounded-lg bg-card p-4">
        <JobMetadata job={job} />
      </div>

      {job.error && (
        <div className="border border-error/30 rounded-lg bg-error/5 p-4 text-sm text-error">
          <strong>Error:</strong> {job.error}
        </div>
      )}

      {job.status === "completed" && <TranscriptViewer jobId={job.id} />}

      {job.status === "processing" && (
        <div className="text-center py-8 text-muted">
          <div className="text-2xl mb-2 animate-pulse">🔄</div>
          <p>Transcription in progress...</p>
          <p className="text-xs mt-1">This page will update automatically.</p>
        </div>
      )}

      {job.status === "pending" && (
        <div className="text-center py-8 text-muted">
          <p>Waiting in queue...</p>
          <p className="text-xs mt-1">This page will update when processing begins.</p>
        </div>
      )}
    </div>
  );
}
