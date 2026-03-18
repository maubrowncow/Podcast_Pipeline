"use client";

import { useEffect, useState, useCallback } from "react";
import { JobCard } from "./job-card";

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

export function JobList() {
  const [jobs, setJobs] = useState<JobData[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchJobs = useCallback(async () => {
    try {
      const res = await fetch("/api/jobs");
      const data = await res.json();
      setJobs(data.jobs);
    } catch (err) {
      console.error("Failed to fetch jobs:", err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchJobs();
    const interval = setInterval(fetchJobs, 5000);
    return () => clearInterval(interval);
  }, [fetchJobs]);

  const handleAction = async (url: string, method: string) => {
    try {
      await fetch(url, { method });
      fetchJobs();
    } catch (err) {
      console.error("Action failed:", err);
    }
  };

  const handleRetry = (id: number) =>
    handleAction(`/api/jobs/${id}/retry`, "POST");
  const handleCancel = (id: number) =>
    handleAction(`/api/jobs/${id}/cancel`, "POST");
  const handleDelete = (id: number) => {
    if (confirm("Delete this job and its files?")) {
      handleAction(`/api/jobs/${id}`, "DELETE");
    }
  };

  if (loading) {
    return <p className="text-muted text-sm">Loading jobs...</p>;
  }

  if (jobs.length === 0) {
    return (
      <div className="text-center py-12 text-muted">
        <p className="text-lg mb-2">No transcription jobs yet</p>
        <p className="text-sm">
          Go to{" "}
          <a href="/upload" className="text-accent hover:underline">
            Upload
          </a>{" "}
          to get started.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {jobs.map((job) => (
        <JobCard
          key={job.id}
          job={job}
          onRetry={handleRetry}
          onCancel={handleCancel}
          onDelete={handleDelete}
        />
      ))}
    </div>
  );
}
