import { db } from "@/lib/db";
import { transcriptSegments } from "@/lib/db/schema";
import { eq } from "drizzle-orm";
import fs from "node:fs";
import type { ElevenLabsResult } from "./elevenlabs-client";

export async function condenseTranscript(
  jobId: number,
  transcriptPath: string
): Promise<number> {
  const raw = JSON.parse(
    fs.readFileSync(transcriptPath, "utf-8")
  ) as ElevenLabsResult & { metadata: unknown };

  // Idempotent — clear existing segments for this job before re-inserting
  db.delete(transcriptSegments).where(eq(transcriptSegments.jobId, jobId)).run();

  let idx = 0;
  for (const segment of raw.segments) {
    const text = segment.text.trim();
    if (!text) continue;
    db.insert(transcriptSegments)
      .values({
        jobId,
        speaker: segment.speaker ?? null,
        startMs: Math.round(segment.start * 1000),
        endMs: Math.round(segment.end * 1000),
        text,
        segmentIndex: idx++,
      })
      .run();
  }

  return idx;
}

export function msToTimecode(ms: number): string {
  const totalSeconds = Math.floor(ms / 1000);
  const h = Math.floor(totalSeconds / 3600);
  const m = Math.floor((totalSeconds % 3600) / 60);
  const s = totalSeconds % 60;
  const msRem = ms % 1000;
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}.${String(msRem).padStart(3, "0")}`;
}

export function toCondensedText(
  segments: { speaker: string | null; startMs: number; endMs: number; text: string }[]
): string {
  return segments
    .map(
      (s) =>
        `[${msToTimecode(s.startMs)}] ${s.speaker ?? "UNKNOWN"}: ${s.text}`
    )
    .join("\n");
}
