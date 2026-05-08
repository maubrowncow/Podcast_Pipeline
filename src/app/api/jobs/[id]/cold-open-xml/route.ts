import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { jobs, premiereSequences } from "@/lib/db/schema";
import { eq } from "drizzle-orm";
import { resolveQuotesFromTranscriptFile } from "@/lib/quote-resolver";
import { assembleColdOpen, type ColdOpenRange } from "@/lib/cold-open-assembler";
import type { SequenceModel } from "@/lib/fcp-xml-parser";

export const runtime = "nodejs";

interface QuoteInput {
  text: string;
  label?: string;
}

/**
 * POST /api/jobs/[id]/cold-open-xml
 * Body (JSON): { quotes: QuoteInput[], sequenceName?: string }
 *
 * 1. Resolves each quote to word-level timecodes via fuzzy match.
 * 2. Runs the conform against the uploaded Premiere sequence model.
 * 3. Returns a downloadable FCP7 XML.
 */
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const jobId = parseInt(id, 10);
  if (isNaN(jobId)) {
    return NextResponse.json({ error: "Invalid job ID" }, { status: 400 });
  }

  const [job] = db.select().from(jobs).where(eq(jobs.id, jobId)).all();
  if (!job) return NextResponse.json({ error: "Job not found" }, { status: 404 });

  if (!job.transcriptPath) {
    return NextResponse.json({ error: "No transcript available" }, { status: 400 });
  }

  const seqRow = db
    .select()
    .from(premiereSequences)
    .where(eq(premiereSequences.jobId, jobId))
    .get();

  if (!seqRow) {
    return NextResponse.json(
      { error: "No Premiere XML uploaded for this job — upload it first" },
      { status: 400 }
    );
  }

  const body = await req.json() as {
    quotes?: QuoteInput[];
    sequenceName?: string;
    audioFileId?: string;
    endPaddingMs?: number;
  };
  const quotes = body.quotes ?? [];
  if (quotes.length === 0) {
    return NextResponse.json({ error: "No quotes provided" }, { status: 400 });
  }

  // Resolve quotes → timecodes
  const quoteTexts = quotes.map(q => q.text);
  const resolved = resolveQuotesFromTranscriptFile(job.transcriptPath, quoteTexts);

  // Add end padding so phrases don't get cut off mid-word
  const endPadding = body.endPaddingMs ?? 750;

  // Build ColdOpenRange list (in the order provided)
  const ranges: ColdOpenRange[] = resolved.map((r, i) => ({
    label: quotes[i].label ?? r.quote,
    startMs: r.startMs,
    endMs: r.endMs + endPadding,
  }));

  // Conform against the sequence model
  const model = JSON.parse(seqRow.modelJson) as SequenceModel;
  const sequenceName = body.sequenceName ?? "Cold Open";
  const audioFileId = body.audioFileId || undefined;
  const xml = assembleColdOpen(model, ranges, sequenceName, audioFileId);

  const baseName = job.originalFilename.replace(/\.[^.]+$/, "");
  return new NextResponse(xml, {
    headers: {
      "Content-Type": "application/xml",
      "Content-Disposition": `attachment; filename="${baseName}_cold_open.xml"`,
    },
  });
}
