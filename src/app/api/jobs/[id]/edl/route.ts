import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { jobs, transcriptSegments } from "@/lib/db/schema";
import { eq, asc } from "drizzle-orm";
import { generateFCP7XML, generateCMXEdl } from "@/lib/edl-generator";

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

  const segments = db
    .select()
    .from(transcriptSegments)
    .where(eq(transcriptSegments.jobId, jobId))
    .orderBy(asc(transcriptSegments.segmentIndex))
    .all();

  if (segments.length === 0) {
    return NextResponse.json(
      { error: "No segments — run condense first" },
      { status: 400 }
    );
  }

  const format = req.nextUrl.searchParams.get("format") ?? "xml";
  const baseName = job.originalFilename.replace(/\.[^.]+$/, "");

  if (format === "edl") {
    const edl = generateCMXEdl(segments, job.originalFilename);
    return new NextResponse(edl, {
      headers: {
        "Content-Type": "text/plain; charset=utf-8",
        "Content-Disposition": `attachment; filename="${baseName}.edl"`,
      },
    });
  }

  const xml = generateFCP7XML(
    segments,
    job.originalFilename,
    job.durationSeconds ?? segments[segments.length - 1].endMs / 1000
  );

  return new NextResponse(xml, {
    headers: {
      "Content-Type": "application/xml",
      "Content-Disposition": `attachment; filename="${baseName}.xml"`,
    },
  });
}
