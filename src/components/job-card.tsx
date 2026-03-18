"use client";

import Link from "next/link";
import { StatusBadge } from "./status-badge";

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

function formatRelativeTime(dateStr: string): string {
  const date = new Date(dateStr);
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffSec = Math.floor(diffMs / 1000);
  const diffMin = Math.floor(diffSec / 60);
  const diffHr = Math.floor(diffMin / 60);
  const diffDay = Math.floor(diffHr / 24);

  if (diffSec < 60) return "just now";
  if (diffMin < 60) return `${diffMin}m ago`;
  if (diffHr < 24) return `${diffHr}h ago`;
  return `${diffDay}d ago`;
}

function formatDuration(seconds: number): string {
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = Math.floor(seconds % 60);
  if (h > 0) return `${h}h ${m}m`;
  if (m > 0) return `${m}m ${s}s`;
  return `${s}s`;
}

function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  if (bytes < 1024 * 1024 * 1024)
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  return `${(bytes / (1024 * 1024 * 1024)).toFixed(2)} GB`;
}

export function JobCard({
  job,
  onRetry,
  onCancel,
  onDelete,
}: {
  job: JobData;
  onRetry: (id: number) => void;
  onCancel: (id: number) => void;
  onDelete: (id: number) => void;
}) {
  const isClickable = job.status === "completed";

  const card = (
    <div
      className={`border border-border rounded-lg p-4 bg-card ${
        isClickable ? "hover:border-accent cursor-pointer" : ""
      } transition-colors`}
    >
      <div className="flex items-start justify-between gap-4">
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2 mb-1">
            <h3 className="font-medium truncate">{job.originalFilename}</h3>
            <StatusBadge status={job.status} />
          </div>
          <div className="flex gap-3 text-xs text-muted">
            <span>{formatRelativeTime(job.createdAt)}</span>
            {job.fileSizeBytes && <span>{formatFileSize(job.fileSizeBytes)}</span>}
            {job.durationSeconds && (
              <span>Duration: {formatDuration(job.durationSeconds)}</span>
            )}
            {job.processingSeconds && (
              <span>Processed in {formatDuration(job.processingSeconds)}</span>
            )}
            {job.language && <span>Lang: {job.language}</span>}
          </div>
          {job.error && (
            <p className="text-xs text-error mt-1 truncate">{job.error}</p>
          )}
        </div>
        <div className="flex gap-1 shrink-0" onClick={(e) => e.preventDefault()}>
          {(job.status === "failed" || job.status === "cancelled") && (
            <button
              onClick={() => onRetry(job.id)}
              className="px-2 py-1 text-xs rounded bg-accent text-white hover:bg-accent-hover transition-colors"
            >
              Retry
            </button>
          )}
          {job.status === "pending" && (
            <button
              onClick={() => onCancel(job.id)}
              className="px-2 py-1 text-xs rounded border border-border text-muted hover:text-foreground transition-colors"
            >
              Cancel
            </button>
          )}
          {job.status !== "processing" && (
            <button
              onClick={() => onDelete(job.id)}
              className="px-2 py-1 text-xs rounded border border-border text-muted hover:text-error transition-colors"
            >
              Delete
            </button>
          )}
        </div>
      </div>
    </div>
  );

  if (isClickable) {
    return <Link href={`/jobs/${job.id}`}>{card}</Link>;
  }

  return card;
}
