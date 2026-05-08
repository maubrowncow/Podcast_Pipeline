import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { jobs } from "@/lib/db/schema";
import { eq } from "drizzle-orm";
import { condenseTranscript } from "@/lib/transcript-condenser";

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
  if (job.status !== "completed" || !job.transcriptPath) {
    return NextResponse.json(
      { error: "Transcript not available" },
      { status: 400 }
    );
  }

  const count = await condenseTranscript(jobId, job.transcriptPath);
  return NextResponse.json({ segmentCount: count });
}
