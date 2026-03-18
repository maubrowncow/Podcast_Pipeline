import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { jobs } from "@/lib/db/schema";
import { desc } from "drizzle-orm";

export const runtime = "nodejs";

export async function GET() {
  const allJobs = db
    .select({
      id: jobs.id,
      status: jobs.status,
      originalFilename: jobs.originalFilename,
      error: jobs.error,
      language: jobs.language,
      durationSeconds: jobs.durationSeconds,
      processingSeconds: jobs.processingSeconds,
      fileSizeBytes: jobs.fileSizeBytes,
      createdAt: jobs.createdAt,
      startedAt: jobs.startedAt,
      completedAt: jobs.completedAt,
    })
    .from(jobs)
    .orderBy(desc(jobs.createdAt))
    .all();

  return NextResponse.json({ jobs: allJobs });
}
