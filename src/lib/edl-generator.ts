import type { TranscriptSegment } from "@/lib/db/schema";

const TIMEBASE = 30; // 30fps non-drop

function msToFrames(ms: number): number {
  return Math.round((ms / 1000) * TIMEBASE);
}

function msToSMPTE(ms: number): string {
  const frames = msToFrames(ms);
  const ff = frames % TIMEBASE;
  const totalSeconds = Math.floor(frames / TIMEBASE);
  const ss = totalSeconds % 60;
  const mm = Math.floor(totalSeconds / 60) % 60;
  const hh = Math.floor(totalSeconds / 3600);
  return `${String(hh).padStart(2, "0")}:${String(mm).padStart(2, "0")}:${String(ss).padStart(2, "0")}:${String(ff).padStart(2, "0")}`;
}

export function generateFCP7XML(
  segments: TranscriptSegment[],
  originalFilename: string,
  durationSeconds: number
): string {
  const totalDurationMs = Math.round(durationSeconds * 1000);
  const totalFrames = msToFrames(totalDurationMs);
  const sequenceName = originalFilename.replace(/\.[^.]+$/, "");
  const fileId = "file-1";

  // Build cumulative timeline positions
  let timelineCursor = 0;
  const clipItems = segments.map((seg, i) => {
    const clipDuration = msToFrames(seg.endMs - seg.startMs);
    const clipIn = msToFrames(seg.startMs);
    const clipOut = msToFrames(seg.endMs);
    const timelineIn = timelineCursor;
    const timelineOut = timelineCursor + clipDuration;
    timelineCursor = timelineOut;

    const speakerLabel = seg.speaker ?? "UNKNOWN";
    const previewText = seg.text.length > 60
      ? seg.text.slice(0, 57) + "..."
      : seg.text;
    const clipName = `${speakerLabel} — ${previewText}`;

    return `      <clipitem id="clipitem-${i + 1}">
        <name>${escapeXml(clipName)}</name>
        <duration>${clipDuration}</duration>
        <rate>
          <timebase>${TIMEBASE}</timebase>
          <ntsc>FALSE</ntsc>
        </rate>
        <start>${timelineIn}</start>
        <end>${timelineOut}</end>
        <in>${clipIn}</in>
        <out>${clipOut}</out>
        <file id="${fileId}"/>
      </clipitem>`;
  });

  return `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE xmeml>
<xmeml version="5">
  <sequence>
    <name>${escapeXml(sequenceName)}</name>
    <duration>${timelineCursor}</duration>
    <rate>
      <timebase>${TIMEBASE}</timebase>
      <ntsc>FALSE</ntsc>
    </rate>
    <media>
      <audio>
        <numOutputChannels>2</numOutputChannels>
        <track>
          <file id="${fileId}">
            <name>${escapeXml(originalFilename)}</name>
            <pathurl>file:///${escapeXml(originalFilename)}</pathurl>
            <rate>
              <timebase>${TIMEBASE}</timebase>
              <ntsc>FALSE</ntsc>
            </rate>
            <duration>${totalFrames}</duration>
            <media>
              <audio>
                <channelcount>2</channelcount>
              </audio>
            </media>
          </file>
${clipItems.join("\n")}
        </track>
      </audio>
    </media>
  </sequence>
</xmeml>`;
}

// CMX3600 EDL (plain text, simpler fallback)
export function generateCMXEdl(
  segments: TranscriptSegment[],
  originalFilename: string
): string {
  const title = originalFilename.replace(/\.[^.]+$/, "");
  const lines = [
    `TITLE: ${title}`,
    `FCM: NON-DROP FRAME`,
    "",
  ];

  let recordCursor = 0;
  segments.forEach((seg, i) => {
    const editNum = String(i + 1).padStart(3, "0");
    const srcIn = msToSMPTE(seg.startMs);
    const srcOut = msToSMPTE(seg.endMs);
    const durationMs = seg.endMs - seg.startMs;
    const recIn = msToSMPTE(recordCursor);
    const recOut = msToSMPTE(recordCursor + durationMs);
    recordCursor += durationMs;

    lines.push(`${editNum}  AX       A     C        ${srcIn} ${srcOut} ${recIn} ${recOut}`);
    if (seg.speaker) {
      lines.push(`* FROM CLIP NAME: ${originalFilename}`);
      lines.push(`* SPEAKER: ${seg.speaker}`);
    }
    lines.push(`* ${seg.text.slice(0, 120)}`);
    lines.push("");
  });

  return lines.join("\n");
}

function escapeXml(str: string): string {
  return str
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}
