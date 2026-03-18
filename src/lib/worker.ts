import { db } from "@/lib/db";
import { jobs } from "@/lib/db/schema";
import { eq, and, lt } from "drizzle-orm";
import { transcribeFile } from "@/lib/whisperx-client";
import fs from "node:fs";
import path from "node:path";
import { v4 as uuidv4 } from "uuid";

let isProcessing = false;
let intervalId: ReturnType<typeof setInterval> | null = null;

const globalForWorker = globalThis as unknown as {
  __workerStarted?: boolean;
};

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
    console.log(
      `[Worker] Recovering stale job #${job.id} (${job.originalFilename})`
    );
    db.update(jobs)
      .set({ status: "pending", startedAt: null })
      .where(eq(jobs.id, job.id))
      .run();
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

    console.log(
      `[Worker] Processing job #${job.id}: ${job.originalFilename}`
    );

    db.update(jobs)
      .set({ status: "processing", startedAt: new Date() })
      .where(eq(jobs.id, job.id))
      .run();

    const result = await transcribeFile(job.filePath);

    const transcriptDir = process.env.TRANSCRIPT_DIR || "data/transcripts";
    fs.mkdirSync(transcriptDir, { recursive: true });
    const transcriptPath = path.join(transcriptDir, `${uuidv4()}.json`);

    const enrichedResult = {
      ...result,
      metadata: {
        jobId: job.id,
        originalFilename: job.originalFilename,
        transcribedAt: new Date().toISOString(),
      },
    };

    fs.writeFileSync(transcriptPath, JSON.stringify(enrichedResult, null, 2));

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

    console.log(
      `[Worker] Completed job #${job.id} in ${result.processing_seconds?.toFixed(1)}s`
    );
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Unknown error";
    console.error(`[Worker] Job failed:`, message);

    // Find the job that was being processed to mark it failed
    const [processingJob] = db
      .select()
      .from(jobs)
      .where(eq(jobs.status, "processing"))
      .limit(1)
      .all();

    if (processingJob) {
      db.update(jobs)
        .set({
          status: "failed",
          error: message,
          completedAt: new Date(),
        })
        .where(eq(jobs.id, processingJob.id))
        .run();
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
