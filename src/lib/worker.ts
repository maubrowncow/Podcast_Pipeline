import { db } from "@/lib/db";
import { jobs } from "@/lib/db/schema";
import { eq, and, lt } from "drizzle-orm";
import { transcribeFile, WhisperXSegment } from "@/lib/whisperx-client";
import { detectEvents, SenseVoiceEvent } from "@/lib/sensevoice-client";
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

/**
 * Fuse SenseVoice events into WhisperX segments.
 * For each segment, check if any SenseVoice events overlap
 * and add an `events` array to the segment.
 */
function fuseEvents(
  segments: WhisperXSegment[],
  events: SenseVoiceEvent[]
): WhisperXSegment[] {
  return segments.map((segment) => {
    // Find events that overlap with this segment's time range
    const overlapping = events.filter(
      (event) => event.start < segment.end && event.end > segment.start
    );

    const eventTypes = [
      ...new Set(overlapping.map((e) => e.type)),
    ];

    return {
      ...segment,
      events: eventTypes.length > 0 ? eventTypes : undefined,
    } as WhisperXSegment & { events?: string[] };
  });
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

    const whisperxUrl = process.env.WHISPERX_URL || "http://localhost:9000";
    const sensevoiceUrl = process.env.SENSEVOICE_URL || "http://localhost:9001";
    const fileSize = job.fileSizeBytes ? formatBytes(job.fileSizeBytes) : "unknown size";

    logJob(job.id, `Job picked up from queue`);
    logJob(job.id, `File: ${job.originalFilename} (${fileSize})`);

    db.update(jobs)
      .set({ status: "processing", startedAt: new Date() })
      .where(eq(jobs.id, job.id))
      .run();

    logJob(job.id, `Status set to processing`);

    // Check WhisperX server health
    logJob(job.id, `Checking WhisperX server at ${whisperxUrl}...`);
    try {
      const healthRes = await fetch(`${whisperxUrl}/health`, {
        signal: AbortSignal.timeout(5000),
      });
      if (healthRes.ok) {
        const health = await healthRes.json();
        logJob(job.id, `WhisperX online — model: ${health.model}, device: ${health.device}, GPU: ${health.gpu || "N/A"}`);
      } else {
        logJob(job.id, `WhisperX health check returned status ${healthRes.status}`, "warn");
      }
    } catch {
      logJob(job.id, `WhisperX health check failed — proceeding anyway`, "warn");
    }

    // Check SenseVoice server health
    logJob(job.id, `Checking SenseVoice server at ${sensevoiceUrl}...`);
    let sensevoiceAvailable = false;
    try {
      const healthRes = await fetch(`${sensevoiceUrl}/health`, {
        signal: AbortSignal.timeout(5000),
      });
      if (healthRes.ok) {
        const health = await healthRes.json();
        logJob(job.id, `SenseVoice online — model: ${health.model}, device: ${health.device}, GPU: ${health.gpu || "N/A"}`);
        sensevoiceAvailable = true;
      } else {
        logJob(job.id, `SenseVoice health check returned status ${healthRes.status}`, "warn");
      }
    } catch {
      logJob(job.id, `SenseVoice not reachable — skipping event detection`, "warn");
    }

    // ─── Step 1: WhisperX Transcription + Diarization ───
    logJob(job.id, `Reading file from disk...`);
    logJob(job.id, `Uploading to WhisperX for transcription + diarization (model: ${job.whisperModel})...`);

    const sendStart = Date.now();
    const result = await transcribeFile(job.filePath, job.whisperModel);
    const sendElapsed = (Date.now() - sendStart) / 1000;

    logJob(job.id, `Transcription complete — took ${formatDuration(sendElapsed)}`);
    logJob(job.id, `Audio duration: ${result.duration_seconds ? formatDuration(result.duration_seconds) : "unknown"}`);
    logJob(job.id, `Realtime factor: ${result.realtime_factor ?? "N/A"}x`);
    logJob(job.id, `Language detected: ${result.language || "unknown"}`);
    logJob(job.id, `Segments: ${result.segments?.length ?? 0}`);

    const wordCount = result.segments?.reduce(
      (sum, seg) => sum + (seg.words?.length ?? 0),
      0
    ) ?? 0;
    logJob(job.id, `Words (with timestamps): ${wordCount}`);

    // Check for speaker info
    const speakers = new Set<string>();
    for (const seg of result.segments ?? []) {
      if (seg.speaker) speakers.add(seg.speaker);
    }
    if (speakers.size > 0) {
      logJob(job.id, `Speakers detected: ${[...speakers].sort().join(", ")}`);
    } else {
      logJob(job.id, `No speaker diarization in result`, "warn");
    }

    // ─── Step 2: SenseVoice Event Detection ───
    let fusedSegments = result.segments;
    let eventSummary: Record<string, number> = {};

    if (sensevoiceAvailable) {
      logJob(job.id, `Uploading to SenseVoice for laughter/event detection...`);

      const senseStart = Date.now();
      try {
        const senseResult = await detectEvents(job.filePath);
        const senseElapsed = (Date.now() - senseStart) / 1000;

        logJob(job.id, `Event detection complete — took ${formatDuration(senseElapsed)}`);
        logJob(job.id, `Total events detected: ${senseResult.total_events}`);

        // Log summary of each event type
        for (const [eventType, count] of Object.entries(senseResult.summary)) {
          logJob(job.id, `  ${eventType}: ${count} occurrence(s)`);
        }
        eventSummary = senseResult.summary;

        // ─── Step 3: Timestamp Fusion ───
        if (senseResult.events.length > 0) {
          logJob(job.id, `Fusing ${senseResult.events.length} events into transcript segments...`);
          fusedSegments = fuseEvents(result.segments, senseResult.events);

          const segmentsWithEvents = fusedSegments.filter(
            (s) => (s as WhisperXSegment & { events?: string[] }).events
          ).length;
          logJob(job.id, `${segmentsWithEvents} segments tagged with events`);
        } else {
          logJob(job.id, `No non-speech events found — transcript unchanged`);
        }
      } catch (error) {
        const msg = error instanceof Error ? error.message : "Unknown error";
        logJob(job.id, `SenseVoice detection failed: ${msg} — continuing without events`, "warn");
      }
    } else {
      logJob(job.id, `Skipping event detection (SenseVoice unavailable)`);
    }

    // ─── Save enriched transcript ───
    const transcriptDir = process.env.TRANSCRIPT_DIR || "data/transcripts";
    fs.mkdirSync(transcriptDir, { recursive: true });
    const transcriptPath = path.join(transcriptDir, `${uuidv4()}.json`);

    logJob(job.id, `Saving enriched transcript to ${transcriptPath}...`);

    const enrichedResult = {
      ...result,
      segments: fusedSegments,
      event_summary: eventSummary,
      metadata: {
        jobId: job.id,
        originalFilename: job.originalFilename,
        transcribedAt: new Date().toISOString(),
        diarized: speakers.size > 0,
        speakers: [...speakers].sort(),
        eventsDetected: Object.keys(eventSummary).length > 0,
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
        processingSeconds: result.processing_seconds,
        completedAt: new Date(),
      })
      .where(eq(jobs.id, job.id))
      .run();

    logJob(job.id, `Job completed successfully`);
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Unknown error";

    // Find the job that was being processed to mark it failed
    const [processingJob] = db
      .select()
      .from(jobs)
      .where(eq(jobs.status, "processing"))
      .limit(1)
      .all();

    if (processingJob) {
      logJob(processingJob.id, `FAILED: ${message}`, "error");
      db.update(jobs)
        .set({
          status: "failed",
          error: message,
          completedAt: new Date(),
        })
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
