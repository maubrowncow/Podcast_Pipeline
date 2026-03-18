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
    <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 text-sm">
      <div>
        <span className="text-muted block text-xs">Filename</span>
        <span className="font-medium truncate block">{job.originalFilename}</span>
      </div>
      {job.language && (
        <div>
          <span className="text-muted block text-xs">Language</span>
          <span className="font-medium">{job.language}</span>
        </div>
      )}
      {job.durationSeconds != null && (
        <div>
          <span className="text-muted block text-xs">Duration</span>
          <span className="font-medium">{formatDuration(job.durationSeconds)}</span>
        </div>
      )}
      {job.processingSeconds != null && (
        <div>
          <span className="text-muted block text-xs">Processing Time</span>
          <span className="font-medium">{formatDuration(job.processingSeconds)}</span>
        </div>
      )}
      {realtimeFactor && (
        <div>
          <span className="text-muted block text-xs">Realtime Factor</span>
          <span className="font-medium">{realtimeFactor}x</span>
        </div>
      )}
      {job.fileSizeBytes != null && (
        <div>
          <span className="text-muted block text-xs">File Size</span>
          <span className="font-medium">{formatFileSize(job.fileSizeBytes)}</span>
        </div>
      )}
    </div>
  );
}
