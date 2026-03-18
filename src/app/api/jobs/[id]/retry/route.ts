import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { jobs } from "@/lib/db/schema";
import { eq } from "drizzle-orm";

export const runtime = "nodejs";

export async function POST(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const jobId = parseInt(id, 10);
  if (isNaN(jobId)) {
    return NextResponse.json({ error: "Invalid job ID" }, { status: 400 });
  }

  const [job] = db.select().from(jobs).where(eq(jobs.id, jobId)).all();
  if (!job) {
    return NextResponse.json({ error: "Job not found" }, { status: 404 });
  }

  if (job.status !== "failed" && job.status !== "cancelled") {
    return NextResponse.json(
      { error: "Only failed or cancelled jobs can be retried" },
      { status: 400 }
    );
  }

  db.update(jobs)
    .set({
      status: "pending",
      error: null,
      startedAt: null,
      completedAt: null,
    })
    .where(eq(jobs.id, jobId))
    .run();

  return NextResponse.json({ success: true, status: "pending" });
}
