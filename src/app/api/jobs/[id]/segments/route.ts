import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { jobs, transcriptSegments, type TranscriptSegment } from "@/lib/db/schema";
import { eq, asc } from "drizzle-orm";
import { toCondensedText } from "@/lib/transcript-condenser";
import Database from "better-sqlite3";

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

  const url = req.nextUrl;
  const query = url.searchParams.get("q")?.trim() ?? "";
  const format = url.searchParams.get("format") ?? "json";
  const page = Math.max(1, parseInt(url.searchParams.get("page") ?? "1", 10));
  const limit = Math.min(200, Math.max(1, parseInt(url.searchParams.get("limit") ?? "50", 10)));
  const offset = (page - 1) * limit;

  let segments: TranscriptSegment[];

  if (query) {
    // FTS5 search via raw SQL
    const dbPath = process.env.DATABASE_PATH || "data/app.db";
    const sqlite = new Database(dbPath, { readonly: true });
    try {
      segments = sqlite.prepare(`
        SELECT ts.*
        FROM transcript_segments ts
        JOIN transcript_segments_fts fts ON ts.id = fts.rowid
        WHERE fts MATCH ?
          AND ts.job_id = ?
        ORDER BY ts.segment_index ASC
        LIMIT ? OFFSET ?
      `).all(query, jobId, limit, offset) as TranscriptSegment[];
    } finally {
      sqlite.close();
    }
  } else {
    segments = db
      .select()
      .from(transcriptSegments)
      .where(eq(transcriptSegments.jobId, jobId))
      .orderBy(asc(transcriptSegments.segmentIndex))
      .limit(limit)
      .offset(offset)
      .all();
  }

  if (format === "text") {
    const text = toCondensedText(segments);
    const baseName = job.originalFilename.replace(/\.[^.]+$/, "");
    return new NextResponse(text, {
      headers: {
        "Content-Type": "text/plain; charset=utf-8",
        "Content-Disposition": `attachment; filename="${baseName}_condensed.txt"`,
      },
    });
  }

  return NextResponse.json({ segments, page, limit });
}
