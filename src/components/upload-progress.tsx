import { Progress } from "@/components/ui/progress";

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
    <div className="border border-border bg-card px-4 py-3 space-y-2">
      <div className="flex items-center justify-between">
        <span className="text-xs font-bold uppercase tracking-[0.08em] truncate mr-2">
          {upload.file.name}
        </span>
        <span className="text-[10px] text-muted-foreground uppercase tracking-[0.14em] shrink-0">
          {formatFileSize(upload.file.size)}
        </span>
      </div>

      {upload.status === "uploading" && (
        <Progress value={upload.progress} />
      )}

      <div className="text-[10px] uppercase tracking-[0.14em]">
        {upload.status === "pending" && (
          <span className="text-muted-foreground">Waiting...</span>
        )}
        {upload.status === "uploading" && (
          <span className="text-foreground">{upload.progress}% uploaded</span>
        )}
        {upload.status === "done" && (
          <span className="text-accent-green">
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
