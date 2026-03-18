interface UploadItem {
  file: File;
  progress: number;
  status: "pending" | "uploading" | "done" | "error";
  error?: string;
  jobId?: number;
}

function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  if (bytes < 1024 * 1024 * 1024)
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  return `${(bytes / (1024 * 1024 * 1024)).toFixed(2)} GB`;
}

export function UploadProgress({ upload }: { upload: UploadItem }) {
  return (
    <div className="border border-border rounded-lg p-3 bg-card">
      <div className="flex items-center justify-between mb-1">
        <span className="text-sm font-medium truncate mr-2">
          {upload.file.name}
        </span>
        <span className="text-xs text-muted shrink-0">
          {formatFileSize(upload.file.size)}
        </span>
      </div>

      {upload.status === "uploading" && (
        <div className="w-full bg-border rounded-full h-1.5 mt-2">
          <div
            className="bg-accent h-1.5 rounded-full transition-all duration-300"
            style={{ width: `${upload.progress}%` }}
          />
        </div>
      )}

      <div className="mt-1 text-xs">
        {upload.status === "pending" && (
          <span className="text-muted">Waiting...</span>
        )}
        {upload.status === "uploading" && (
          <span className="text-accent">{upload.progress}% uploaded</span>
        )}
        {upload.status === "done" && (
          <span className="text-success">
            Queued for transcription (Job #{upload.jobId})
          </span>
        )}
        {upload.status === "error" && (
          <span className="text-error">{upload.error}</span>
        )}
      </div>
    </div>
  );
}
