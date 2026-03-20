import { db } from "@/lib/db";
import { jobs } from "@/lib/db/schema";
import { eq, and, lt } from "drizzle-orm";
import { transcribeFile } from "@/lib/elevenlabs-client";
import { logJob } from "@/lib/job-logger";
import fs from "node:fs";
import path from "node:path";
import { v4 as uuidv4 } from "uuid";

let isProcessing = false;
let intervalId: ReturnType<typeof setInterval> | null = null;

const globalForWorker = globalThis as unknown as {
  __workerStarted?: boolean;
};

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  if (bytes < 1024 * 1024 * 1024)
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  return `${(bytes / (1024 * 1024 * 1024)).toFixed(2)} GB`;
}

function formatDuration(seconds: number): string {
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = Math.floor(seconds % 60);
  if (h > 0) return `${h}h ${m}m ${s}s`;
  if (m > 0) return `${m}m ${s}s`;
  return `${s}s`;
}

function recoverStaleJobs() {
  const sixtyMinutesAgo = new Date(Date.now() - 60 * 60 * 1000);
  const staleJobs = db
    .select()
    .from(jobs)
    .where(
      and(eq(jobs.status, "processing"), lt(jobs.startedAt, sixtyMinutesAgo))
    )
    .all();

  for (const job of staleJobs) {
    logJob(job.id, `Recovering stale job — stuck in processing for >60 minutes`, "warn");
    db.update(jobs)
      .set({ status: "pending", startedAt: null })
      .where(eq(jobs.id, job.id))
      .run();
    logJob(job.id, `Reset to pending, will retry`);
  }

  if (staleJobs.length > 0) {
    console.log(`[Worker] Recovered ${staleJobs.length} stale job(s)`);
  }
}

async function processNextJob() {
  if (isProcessing) return;
  isProcessing = true;

  try {
    const [job] = db
      .select()
      .from(jobs)
      .where(eq(jobs.status, "pending"))
      .orderBy(jobs.createdAt)
      .limit(1)
      .all();

    if (!job) return;

    const fileSize = job.fileSizeBytes ? formatBytes(job.fileSizeBytes) : "unknown size";
    logJob(job.id, `Job picked up from queue`);
    logJob(job.id, `File: ${job.originalFilename} (${fileSize})`);

    db.update(jobs)
      .set({ status: "processing", startedAt: new Date() })
      .where(eq(jobs.id, job.id))
      .run();

    // ─── Transcribe with ElevenLabs Scribe ───
    logJob(job.id, `Sending to ElevenLabs Scribe (diarize, word timestamps, audio events)...`);
    if (job.numSpeakers) logJob(job.id, `Speaker count: ${job.numSpeakers}`);

    const sendStart = Date.now();
    const result = await transcribeFile(job.filePath, job.numSpeakers ?? undefined);
    const elapsed = (Date.now() - sendStart) / 1000;

    logJob(job.id, `Transcription complete — took ${formatDuration(elapsed)}`);
    logJob(job.id, `Audio duration: ${formatDuration(result.duration_seconds)}`);
    logJob(job.id, `Language: ${result.language}`);
    logJob(job.id, `Segments: ${result.segments.length}`);
    logJob(job.id, `Words (with timestamps): ${result.words.filter(w => w.type === "word").length}`);

    const speakers = new Set(result.segments.map(s => s.speaker).filter(Boolean));
    if (speakers.size > 0) {
      logJob(job.id, `Speakers detected: ${[...speakers].sort().join(", ")}`);
    } else {
      logJob(job.id, `No speaker diarization in result`, "warn");
    }

    if (result.raw_events.length > 0) {
      logJob(job.id, `Audio events detected: ${result.raw_events.length} total`);
      for (const [type, count] of Object.entries(result.event_summary)) {
        logJob(job.id, `  ${type}: ${count} occurrence(s)`);
      }
    } else {
      logJob(job.id, `No audio events detected`);
    }

    // ─── Save transcript ───
    const transcriptDir = process.env.TRANSCRIPT_DIR || "data/transcripts";
    fs.mkdirSync(transcriptDir, { recursive: true });
    const transcriptPath = path.join(transcriptDir, `${uuidv4()}.json`);

    const enrichedResult = {
      ...result,
      metadata: {
        jobId: job.id,
        originalFilename: job.originalFilename,
        transcribedAt: new Date().toISOString(),
        diarized: speakers.size > 0,
        speakers: [...speakers].sort(),
        numSpeakers: job.numSpeakers,
        provider: "elevenlabs-scribe-v1",
      },
    };

    fs.writeFileSync(transcriptPath, JSON.stringify(enrichedResult, null, 2));
    const transcriptSize = fs.statSync(transcriptPath).size;
    logJob(job.id, `Transcript saved (${formatBytes(transcriptSize)})`);

    db.update(jobs)
      .set({
        status: "completed",
        transcriptPath,
        language: result.language,
        durationSeconds: result.duration_seconds,
        processingSeconds: elapsed,
        completedAt: new Date(),
      })
      .where(eq(jobs.id, job.id))
      .run();

    try { fs.unlinkSync(job.filePath); } catch { /* ignore */ }

    logJob(job.id, `Job completed successfully`);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";

    const [processingJob] = db
      .select()
      .from(jobs)
      .where(eq(jobs.status, "processing"))
      .limit(1)
      .all();

    if (processingJob) {
      logJob(processingJob.id, `FAILED: ${message}`, "error");
      db.update(jobs)
        .set({ status: "failed", error: message, completedAt: new Date() })
        .where(eq(jobs.id, processingJob.id))
        .run();
    } else {
      console.error(`[Worker] Job failed (no processing job found):`, message);
    }
  } finally {
    isProcessing = false;
  }
}

export function startWorker(intervalMs = 5000) {
  if (globalForWorker.__workerStarted) return;
  globalForWorker.__workerStarted = true;

  console.log(`[Worker] Starting with ${intervalMs}ms poll interval`);
  recoverStaleJobs();
  intervalId = setInterval(processNextJob, intervalMs);
  processNextJob();
}

export function stopWorker() {
  if (intervalId) {
    clearInterval(intervalId);
    intervalId = null;
    globalForWorker.__workerStarted = false;
    console.log("[Worker] Stopped");
  }
}
