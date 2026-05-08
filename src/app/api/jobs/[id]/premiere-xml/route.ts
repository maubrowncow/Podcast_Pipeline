import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { jobs, premiereSequences } from "@/lib/db/schema";
import { eq } from "drizzle-orm";
import { parseFCPXML } from "@/lib/fcp-xml-parser";
import Busboy from "busboy";
import { Readable } from "node:stream";

export const runtime = "nodejs";

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

  // Parse multipart to get the XML file
  const contentType = req.headers.get("content-type") ?? "";
  if (!contentType.includes("multipart/form-data")) {
    return NextResponse.json({ error: "Expected multipart/form-data" }, { status: 400 });
  }

  const xmlString = await new Promise<string>((resolve, reject) => {
    const bb = Busboy({ headers: { "content-type": contentType } });
    let xml = "";
    bb.on("file", (_field, stream) => {
      stream.on("data", (chunk: Buffer) => { xml += chunk.toString("utf-8"); });
      stream.on("end", () => resolve(xml));
    });
    bb.on("error", reject);
    // Feed request body into busboy
    const nodeStream = Readable.fromWeb(req.body as never);
    nodeStream.pipe(bb);
  });

  let model;
  try {
    model = parseFCPXML(xmlString);
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return NextResponse.json({ error: `Failed to parse XML: ${msg}` }, { status: 422 });
  }

  // Upsert into premiere_sequences
  const existing = db
    .select()
    .from(premiereSequences)
    .where(eq(premiereSequences.jobId, jobId))
    .get();

  const row = {
    jobId,
    sequenceName: model.name,
    timebase: model.timebase,
    ntsc: model.ntsc,
    startTimecodeFrame: model.startTimecodeFrame,
    durationFrames: model.durationFrames,
    modelJson: JSON.stringify(model),
    createdAt: new Date(),
  };

  if (existing) {
    db.update(premiereSequences).set(row).where(eq(premiereSequences.jobId, jobId)).run();
  } else {
    db.insert(premiereSequences).values(row).run();
  }

  return NextResponse.json({
    sequenceName: model.name,
    timebase: model.timebase,
    ntsc: model.ntsc,
    durationFrames: model.durationFrames,
    tracks: {
      video: Math.max(0, ...model.clips.filter(c => c.trackType === "video").map(c => c.trackIndex + 1)),
      audio: Math.max(0, ...model.clips.filter(c => c.trackType === "audio").map(c => c.trackIndex + 1)),
    },
    clipCount: model.clips.length,
    fileCount: Object.keys(model.files).length,
  });
}

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const jobId = parseInt(id, 10);
  const row = db
    .select()
    .from(premiereSequences)
    .where(eq(premiereSequences.jobId, jobId))
    .get();

  if (!row) return NextResponse.json({ sequence: null });

  const model = JSON.parse(row.modelJson);

  // Build file list for audio source selector
  const files = Object.entries(model.files ?? {}).map(([id, f]) => ({
    id,
    name: String((f as Record<string, unknown>)?.name ?? id),
  }));

  return NextResponse.json({
    sequenceName: row.sequenceName,
    timebase: row.timebase,
    ntsc: row.ntsc,
    durationFrames: row.durationFrames,
    tracks: {
      video: Math.max(0, ...model.clips.filter((c: {trackType: string, trackIndex: number}) => c.trackType === "video").map((c: {trackIndex: number}) => c.trackIndex + 1)),
      audio: Math.max(0, ...model.clips.filter((c: {trackType: string, trackIndex: number}) => c.trackType === "audio").map((c: {trackIndex: number}) => c.trackIndex + 1)),
    },
    clipCount: model.clips.length,
    files,
  });
}
