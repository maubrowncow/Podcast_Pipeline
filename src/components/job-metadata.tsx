interface JobData {
  id: number;
  originalFilename: string;
  language: string | null;
  durationSeconds: number | null;
  processingSeconds: number | null;
  fileSizeBytes: number | null;
  createdAt: string;
  completedAt: string | null;
}

function formatDuration(seconds: number): string {
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = Math.floor(seconds % 60);
  if (h > 0) return `${h}h ${m}m ${s}s`;
  if (m > 0) return `${m}m ${s}s`;
  return `${s}s`;
}

function formatFileSize(bytes: number): string {
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  if (bytes < 1024 * 1024 * 1024)
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  return `${(bytes / (1024 * 1024 * 1024)).toFixed(2)} GB`;
}

export function JobMetadata({ job }: { job: JobData }) {
  const realtimeFactor =
    job.durationSeconds && job.processingSeconds
      ? (job.processingSeconds / job.durationSeconds).toFixed(2)
      : null;

  return (
    <div className="grid grid-cols-2 sm:grid-cols-3 gap-4">
      <div>
        <span className="text-[10px] font-bold uppercase tracking-[0.14em] text-muted-foreground block mb-0.5">
          Filename
        </span>
        <span className="text-xs tracking-[0.08em] truncate block">{job.originalFilename}</span>
      </div>
      {job.language && (
        <div>
          <span className="text-[10px] font-bold uppercase tracking-[0.14em] text-muted-foreground block mb-0.5">
            Language
          </span>
          <span className="text-xs tracking-[0.08em]">{job.language}</span>
        </div>
      )}
      {job.durationSeconds != null && (
        <div>
          <span className="text-[10px] font-bold uppercase tracking-[0.14em] text-muted-foreground block mb-0.5">
            Duration
          </span>
          <span className="text-xs tracking-[0.08em]">{formatDuration(job.durationSeconds)}</span>
        </div>
      )}
      {job.processingSeconds != null && (
        <div>
          <span className="text-[10px] font-bold uppercase tracking-[0.14em] text-muted-foreground block mb-0.5">
            Processing
          </span>
          <span className="text-xs tracking-[0.08em]">{formatDuration(job.processingSeconds)}</span>
        </div>
      )}
      {realtimeFactor && (
        <div>
          <span className="text-[10px] font-bold uppercase tracking-[0.14em] text-muted-foreground block mb-0.5">
            RT Factor
          </span>
          <span className="text-xs tracking-[0.08em]">{realtimeFactor}x</span>
        </div>
      )}
      {job.fileSizeBytes != null && (
        <div>
          <span className="text-[10px] font-bold uppercase tracking-[0.14em] text-muted-foreground block mb-0.5">
            File Size
          </span>
          <span className="text-xs tracking-[0.08em]">{formatFileSize(job.fileSizeBytes)}</span>
        </div>
      )}
    </div>
  );
}
