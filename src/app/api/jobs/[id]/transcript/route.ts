import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { jobs } from "@/lib/db/schema";
import { eq } from "drizzle-orm";
import fs from "node:fs";

export const runtime = "nodejs";

export async function GET(
  req: NextRequest,
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
      { status: 404 }
    );
  }

  let transcriptData: string;
  try {
    transcriptData = fs.readFileSync(job.transcriptPath, "utf-8");
  } catch {
    return NextResponse.json(
      { error: "Transcript file not found on disk" },
      { status: 404 }
    );
  }

  const download = req.nextUrl.searchParams.get("download") === "true";

  if (download) {
    const baseName = job.originalFilename.replace(/\.[^.]+$/, "");
    return new NextResponse(transcriptData, {
      headers: {
        "Content-Type": "application/json",
        "Content-Disposition": `attachment; filename="${baseName}_transcript.json"`,
      },
    });
  }

  return new NextResponse(transcriptData, {
    headers: { "Content-Type": "application/json" },
  });
}
