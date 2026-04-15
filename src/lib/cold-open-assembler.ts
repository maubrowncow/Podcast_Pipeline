/**
 * Cold open assembler.
 *
 * Given a SequenceModel (parsed from the source Premiere FCP7 XML) and a list
 * of timecode ranges (startMs/endMs, sourced from quote resolution), this
 * module:
 *
 *  1. Converts each ms range to sequence frames.
 *  2. For each range, finds all clipitems across all tracks that overlap it
 *     (the conform step).
 *  3. Calculates the exact source in/out for each overlapping clip.
 *  4. Places the resulting clips consecutively on an output timeline.
 *  5. Emits a valid FCP7 XML (XMEML v4) for direct import into Premiere.
 */

import type { SequenceModel, SequenceClip, SequenceFile } from "./fcp-xml-parser";
import { msToFrames } from "./fcp-xml-parser";

export interface ColdOpenRange {
  label: string;       // e.g. the quote text, for reference
  startMs: number;
  endMs: number;
}

interface OutputClip {
  sourceClip: SequenceClip;
  sourceIn: number;    // frames in source file
  sourceOut: number;
  timelineStart: number; // frames on output timeline
  timelineEnd: number;
}

function escapeXml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

/** Find all clips across all tracks that overlap [startFrame, endFrame) */
function conformRange(
  model: SequenceModel,
  startFrame: number,
  endFrame: number
): Array<{ clip: SequenceClip; sourceIn: number; sourceOut: number; overlapStart: number; overlapEnd: number }> {
  const results = [];
  for (const clip of model.clips) {
    if (clip.sequenceEnd <= startFrame) continue;
    if (clip.sequenceStart >= endFrame) continue;

    const overlapStart = Math.max(clip.sequenceStart, startFrame);
    const overlapEnd = Math.min(clip.sequenceEnd, endFrame);
    const offsetIntoClip = overlapStart - clip.sequenceStart;
    const sourceIn = clip.sourceIn + offsetIntoClip;
    const sourceOut = sourceIn + (overlapEnd - overlapStart);

    results.push({ clip, sourceIn, sourceOut, overlapStart, overlapEnd });
  }
  return results;
}

// ── XML building helpers ─────────────────────────────────────────────────────

function rateXml(timebase: number, ntsc: boolean): string {
  return `<rate><timebase>${timebase}</timebase><ntsc>${ntsc ? "TRUE" : "FALSE"}</ntsc></rate>`;
}

function fileTimecodeXml(file: SequenceFile, rate: string): string {
  const frame = file.timecodeFrame ?? 0;
  const fmt = file.timecodeDisplayFormat ?? "NDF";
  return `<timecode>${rate}<string>00:00:00:00</string><frame>${frame}</frame><displayformat>${fmt}</displayformat></timecode>`;
}

function fileMediaXml(file: SequenceFile, rate: string): string {
  const w = file.videoWidth ?? 3840;
  const h = file.videoHeight ?? 2160;
  const par = file.pixelAspectRatio ?? "square";
  const fd = file.fieldDominance ?? "none";
  const depth = file.audioDepth ?? 16;
  const sr = file.audioSampleRate ?? 48000;
  const layout = file.audioLayout ?? "stereo";

  return `<media>
              <video>
                <samplecharacteristics>
                  ${rate}
                  <width>${w}</width>
                  <height>${h}</height>
                  <anamorphic>FALSE</anamorphic>
                  <pixelaspectratio>${escapeXml(par)}</pixelaspectratio>
                  <fielddominance>${escapeXml(fd)}</fielddominance>
                </samplecharacteristics>
              </video>
              <audio>
                <samplecharacteristics>
                  <depth>${depth}</depth>
                  <samplerate>${sr}</samplerate>
                </samplecharacteristics>
                <channelcount>1</channelcount>
                <layout>${escapeXml(layout)}</layout>
                <audiochannel>
                  <sourcechannel>1</sourcechannel>
                  <channellabel>left</channellabel>
                </audiochannel>
              </audio>
              <audio>
                <samplecharacteristics>
                  <depth>${depth}</depth>
                  <samplerate>${sr}</samplerate>
                </samplecharacteristics>
                <channelcount>1</channelcount>
                <layout>${escapeXml(layout)}</layout>
                <audiochannel>
                  <sourcechannel>2</sourcechannel>
                  <channellabel>right</channellabel>
                </audiochannel>
              </audio>
            </media>`;
}

function fullFileXml(file: SequenceFile, rate: string): string {
  return `<file id="${escapeXml(file.id)}">
              <name>${escapeXml(file.name)}</name>
              <pathurl>${escapeXml(file.pathurl)}</pathurl>
              ${rate}
              <duration>${file.durationFrames}</duration>
              ${fileTimecodeXml(file, rate)}
              ${fileMediaXml(file, rate)}
            </file>`;
}

// ── Main assembler ───────────────────────────────────────────────────────────

export function assembleColdOpen(
  model: SequenceModel,
  ranges: ColdOpenRange[],
  outputSequenceName = "Cold Open"
): string {
  const { timebase, ntsc } = model;
  const rate = rateXml(timebase, ntsc);

  // ── Collect all output clips and track the total timeline duration ─────────
  const outputClips: OutputClip[] = [];
  const referencedFileIds = new Set<string>();
  let timelineCursor = 0;

  for (const range of ranges) {
    const startFrame = msToFrames(range.startMs, model);
    const endFrame = msToFrames(range.endMs, model);
    const slabDuration = endFrame - startFrame;
    if (slabDuration <= 0) continue;

    const conformed = conformRange(model, startFrame, endFrame);

    for (const { clip, sourceIn, sourceOut, overlapStart, overlapEnd } of conformed) {
      const clipDuration = overlapEnd - overlapStart;
      outputClips.push({
        sourceClip: clip,
        sourceIn,
        sourceOut,
        timelineStart: timelineCursor + (overlapStart - startFrame),
        timelineEnd: timelineCursor + (overlapStart - startFrame) + clipDuration,
      });
      if (clip.fileId) referencedFileIds.add(clip.fileId);
    }

    timelineCursor += slabDuration;
  }

  const totalDuration = timelineCursor;

  // ── Group output clips by track ───────────────────────────────────────────
  const trackMap = new Map<string, OutputClip[]>();
  for (const oc of outputClips) {
    const key = `${oc.sourceClip.trackType}-${oc.sourceClip.trackIndex}`;
    if (!trackMap.has(key)) trackMap.set(key, []);
    trackMap.get(key)!.push(oc);
  }

  const videoTrackIndices = [...trackMap.keys()]
    .filter(k => k.startsWith("video"))
    .map(k => parseInt(k.split("-")[1]))
    .sort((a, b) => a - b);
  const audioTrackIndices = [...trackMap.keys()]
    .filter(k => k.startsWith("audio"))
    .map(k => parseInt(k.split("-")[1]))
    .sort((a, b) => a - b);

  // Track which file ids have been emitted inline (first = full, rest = ref)
  const emittedFileIds = new Set<string>();

  // Unique clip ID counter
  let clipIdCounter = 1;

  // ── Video characteristics from source model or first file ─────────────────
  const firstFile = Object.values(model.files)[0];
  const seqWidth = firstFile?.videoWidth ?? 3840;
  const seqHeight = firstFile?.videoHeight ?? 2160;

  // ── Build clipitem XML for a track ────────────────────────────────────────
  function buildClipItem(oc: OutputClip, trackType: "video" | "audio", audioTrackIdx?: number): string {
    const { sourceClip, sourceIn, sourceOut, timelineStart, timelineEnd } = oc;
    const file = model.files[sourceClip.fileId];
    const clipId = `clipitem-${clipIdCounter++}`;
    const fileDuration = file?.durationFrames ?? (sourceOut - sourceIn);

    // First reference = full inline definition, subsequent = self-closing ref
    let fileRef: string;
    if (file && !emittedFileIds.has(file.id)) {
      emittedFileIds.add(file.id);
      fileRef = fullFileXml(file, rate);
    } else {
      fileRef = `<file id="${escapeXml(sourceClip.fileId)}"/>`;
    }

    const lines = [
      `          <clipitem id="${clipId}">`,
      `            <masterclipid>masterclip-${escapeXml(sourceClip.fileId)}</masterclipid>`,
      `            <name>${escapeXml(sourceClip.name)}</name>`,
      `            <enabled>TRUE</enabled>`,
      `            <duration>${fileDuration}</duration>`,
      `            ${rate}`,
      `            <start>${timelineStart}</start>`,
      `            <end>${timelineEnd}</end>`,
      `            <in>${sourceIn}</in>`,
      `            <out>${sourceOut}</out>`,
    ];

    if (trackType === "video") {
      lines.push(`            <alphatype>none</alphatype>`);
      lines.push(`            <pixelaspectratio>square</pixelaspectratio>`);
      lines.push(`            <anamorphic>FALSE</anamorphic>`);
    }

    if (trackType === "audio" && audioTrackIdx !== undefined) {
      lines.push(`            <sourcetrack>`);
      lines.push(`              <mediatype>audio</mediatype>`);
      lines.push(`              <trackindex>${audioTrackIdx + 1}</trackindex>`);
      lines.push(`            </sourcetrack>`);
    }

    lines.push(`            ${fileRef}`);
    lines.push(`            <logginginfo><description></description><scene></scene><shottake></shottake><lognote></lognote><good></good></logginginfo>`);
    lines.push(`          </clipitem>`);

    return lines.join("\n");
  }

  // ── Emit video tracks ─────────────────────────────────────────────────────
  const maxVideoIdx = videoTrackIndices.length > 0 ? Math.max(...videoTrackIndices) : 0;
  const videoTrackXml = Array.from({ length: maxVideoIdx + 1 }, (_, i) => {
    const clips = trackMap.get(`video-${i}`) ?? [];
    const clipXml = clips.map(oc => buildClipItem(oc, "video")).join("\n");
    return `        <track>
${clipXml}
          <enabled>TRUE</enabled>
          <locked>FALSE</locked>
        </track>`;
  }).join("\n");

  // ── Emit audio tracks ─────────────────────────────────────────────────────
  const maxAudioIdx = audioTrackIndices.length > 0 ? Math.max(...audioTrackIndices) : 0;
  const audioTrackXml = Array.from({ length: maxAudioIdx + 1 }, (_, i) => {
    const clips = trackMap.get(`audio-${i}`) ?? [];
    const clipXml = clips.map(oc => buildClipItem(oc, "audio", i)).join("\n");
    return `        <track>
${clipXml}
          <enabled>TRUE</enabled>
          <locked>FALSE</locked>
          <outputchannelindex>${i + 1}</outputchannelindex>
        </track>`;
  }).join("\n");

  return `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE xmeml>
<xmeml version="4">
  <sequence id="cold-open-seq-1">
    <name>${escapeXml(outputSequenceName)}</name>
    <duration>${totalDuration}</duration>
    ${rate}
    <timecode>
      ${rate}
      <string>00:00:00:00</string>
      <frame>0</frame>
      <displayformat>NDF</displayformat>
    </timecode>
    <media>
      <video>
        <format>
          <samplecharacteristics>
            ${rate}
            <width>${seqWidth}</width>
            <height>${seqHeight}</height>
            <anamorphic>FALSE</anamorphic>
            <pixelaspectratio>square</pixelaspectratio>
            <fielddominance>none</fielddominance>
            <colordepth>24</colordepth>
          </samplecharacteristics>
        </format>
${videoTrackXml}
      </video>
      <audio>
        <numOutputChannels>2</numOutputChannels>
        <format>
          <samplecharacteristics>
            <depth>16</depth>
            <samplerate>48000</samplerate>
          </samplecharacteristics>
        </format>
${audioTrackXml}
      </audio>
    </media>
  </sequence>
</xmeml>`;
}
