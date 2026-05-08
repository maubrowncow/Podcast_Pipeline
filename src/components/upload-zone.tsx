"use client";

import { useState, useRef, useCallback } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { UploadProgress } from "./upload-progress";
import { buttonVariants } from "@/components/ui/button";

const ALLOWED_TYPES = ["mp3", "wav", "m4a", "flac", "ogg", "webm"];


interface UploadItem {
  file: File;
  progress: number;
  status: "pending" | "uploading" | "done" | "error";
  error?: string;
  jobId?: number;
}

export function UploadZone() {
  const router = useRouter();
  const [uploads, setUploads] = useState<UploadItem[]>([]);
  const [isDragging, setIsDragging] = useState(false);
  const [numSpeakers, setNumSpeakers] = useState<string>("2");
  const fileInputRef = useRef<HTMLInputElement>(null);

  const isValidFile = (file: File): boolean => {
    const ext = file.name.split(".").pop()?.toLowerCase() || "";
    return ALLOWED_TYPES.includes(ext);
  };

  const uploadFile = useCallback((file: File, index: number, speakers: string) => {
    const xhr = new XMLHttpRequest();
    const formData = new FormData();
    formData.append("file", file);
    if (speakers) formData.append("numSpeakers", speakers);

    xhr.upload.addEventListener("progress", (e) => {
      if (e.lengthComputable) {
        const progress = Math.round((e.loaded / e.total) * 100);
        setUploads((prev) =>
          prev.map((u, i) =>
            i === index ? { ...u, progress, status: "uploading" } : u
          )
        );
      }
    });

    xhr.addEventListener("load", () => {
      if (xhr.status >= 200 && xhr.status < 300) {
        const data = JSON.parse(xhr.responseText);
        const jobId = data.jobs?.[0]?.jobId;
        setUploads((prev) =>
          prev.map((u, i) =>
            i === index ? { ...u, progress: 100, status: "done", jobId } : u
          )
        );
        if (jobId) {
          router.push(`/jobs/${jobId}`);
        }
      } else {
        let error = "Upload failed";
        try {
          error = JSON.parse(xhr.responseText).error || error;
        } catch { /* ignore */ }
        setUploads((prev) =>
          prev.map((u, i) =>
            i === index ? { ...u, status: "error", error } : u
          )
        );
      }
    });

    xhr.addEventListener("error", () => {
      setUploads((prev) =>
        prev.map((u, i) =>
          i === index
            ? { ...u, status: "error", error: "Network error" }
            : u
        )
      );
    });

    xhr.open("POST", "/api/upload");
    xhr.send(formData);
  }, [router]);

  const handleFiles = useCallback(
    (files: FileList | File[]) => {
      const fileArray = Array.from(files);
      const validFiles = fileArray.filter(isValidFile);
      const invalidFiles = fileArray.filter((f) => !isValidFile(f));

      if (invalidFiles.length > 0) {
        alert(
          `Unsupported files skipped: ${invalidFiles.map((f) => f.name).join(", ")}\n\nAllowed types: ${ALLOWED_TYPES.join(", ")}`
        );
      }

      if (validFiles.length === 0) return;

      const startIndex = uploads.length;
      const newUploads: UploadItem[] = validFiles.map((file) => ({
        file,
        progress: 0,
        status: "pending" as const,
      }));

      setUploads((prev) => [...prev, ...newUploads]);

      validFiles.forEach((file, i) => {
        uploadFile(file, startIndex + i, numSpeakers);
      });
    },
    [uploads.length, uploadFile, numSpeakers]
  );

  const handleDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      setIsDragging(false);
      handleFiles(e.dataTransfer.files);
    },
    [handleFiles]
  );

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(true);
  };

  const handleDragLeave = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
  };

  const allDone =
    uploads.length > 0 && uploads.every((u) => u.status === "done" || u.status === "error");

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-4">
        <label
          htmlFor="num-speakers"
          className="text-[11px] font-bold uppercase tracking-[0.14em] text-muted-foreground shrink-0"
        >
          Speakers
        </label>
        <input
          id="num-speakers"
          type="number"
          min="1"
          max="32"
          value={numSpeakers}
          onChange={(e) => setNumSpeakers(e.target.value)}
          className="w-16 h-8 border-b border-border bg-transparent px-0 py-1 text-sm tracking-[0.08em] outline-none focus:border-accent"
        />
      </div>

      <div
        onDrop={handleDrop}
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onClick={() => fileInputRef.current?.click()}
        className={`border-2 border-dashed p-16 text-center cursor-pointer transition-colors ${
          isDragging
            ? "border-accent bg-accent/5"
            : "border-border hover:border-muted-foreground"
        }`}
      >
        <p className="text-xs font-bold uppercase tracking-[0.14em] mb-2">
          Drop audio files here or click to browse
        </p>
        <p className="text-[10px] text-muted-foreground uppercase tracking-[0.14em] mb-3">
          {ALLOWED_TYPES.join(" / ")}
        </p>
        <span className="inline-block text-[10px] font-bold uppercase tracking-[0.14em] text-accent">
          [ Select Files ]
        </span>
        <input
          ref={fileInputRef}
          type="file"
          multiple
          accept={ALLOWED_TYPES.map((t) => `.${t}`).join(",")}
          className="hidden"
          onChange={(e) => {
            if (e.target.files) handleFiles(e.target.files);
            e.target.value = "";
          }}
        />
      </div>

      {uploads.length > 0 && (
        <div className="space-y-3">
          <h2 className="text-[11px] font-bold uppercase tracking-[0.14em] text-muted-foreground">
            Uploads
          </h2>
          {uploads.map((upload, i) => (
            <UploadProgress key={i} upload={upload} />
          ))}
          {allDone && (
            <div className="text-center pt-4">
              <Link href="/" className={buttonVariants()}>
                View Dashboard
              </Link>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
