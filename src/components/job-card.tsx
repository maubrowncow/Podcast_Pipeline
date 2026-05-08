"use client";

import Link from "next/link";
import { StatusBadge } from "./status-badge";
import { Button } from "@/components/ui/button";

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

const STATUS_ACCENT: Record<string, string> = {
  completed: "border-l-accent-green",
  processing: "border-l-accent-blue",
  pending: "border-l-accent-yellow",
  failed: "border-l-error",
  cancelled: "border-l-muted-foreground",
};

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
  const isClickable = job.status !== "cancelled";
  const leftAccent = STATUS_ACCENT[job.status] ?? "border-l-border";

  const card = (
    <div
      className={`border border-border border-l-[3px] ${leftAccent} bg-card px-4 py-3 transition-colors ${
        isClickable ? "hover:border-accent hover:border-l-accent cursor-pointer" : ""
      }`}
    >
      <div className="flex items-start justify-between gap-4">
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-3 mb-1.5">
            <h3 className="text-xs font-bold tracking-[0.08em] truncate">
              {job.originalFilename}
            </h3>
            <StatusBadge status={job.status} />
          </div>
          <div className="flex gap-4 text-[10px] uppercase tracking-[0.14em]">
            <span className="text-muted-foreground">{formatRelativeTime(job.createdAt)}</span>
            {job.fileSizeBytes && (
              <span className="text-cold-grey">{formatFileSize(job.fileSizeBytes)}</span>
            )}
            {job.durationSeconds && (
              <span className="text-accent-blue">{formatDuration(job.durationSeconds)}</span>
            )}
            {job.processingSeconds && (
              <span className="text-accent-green">
                Proc {formatDuration(job.processingSeconds)}
              </span>
            )}
            {job.language && (
              <span className="text-accent-yellow">{job.language}</span>
            )}
          </div>
          {job.error && (
            <p className="text-[10px] text-error mt-1 truncate tracking-[0.08em]">
              {job.error}
            </p>
          )}
        </div>
        <div
          className="flex gap-1 shrink-0"
          onClick={(e) => e.preventDefault()}
        >
          {(job.status === "failed" || job.status === "cancelled") && (
            <Button
              size="xs"
              variant="bracket"
              className="text-accent hover:text-accent-hover"
              onClick={() => onRetry(job.id)}
            >
              Retry
            </Button>
          )}
          {job.status === "pending" && (
            <Button
              size="xs"
              variant="bracket"
              onClick={() => onCancel(job.id)}
            >
              Cancel
            </Button>
          )}
          {job.status !== "processing" && (
            <Button
              size="xs"
              variant="bracket"
              className="hover:text-error"
              onClick={() => onDelete(job.id)}
            >
              Delete
            </Button>
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
