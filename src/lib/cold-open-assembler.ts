/**
 * Cold open assembler.
 *
 * Given a SequenceModel (parsed from the source Premiere FCP7 XML) and a list
 * of timecode ranges (startMs/endMs, sourced from quote resolution), this
 * module:
 *
 *  1. Converts each ms range to sequence frames.
 *  2. For each range, finds the PRIMARY video clip (real media, not adjustment
 *     layers or nested sequence refs) that covers the most overlap.
 *  3. Calculates the exact source in/out for each clip.
 *  4. Places the resulting clips consecutively on a FLAT output timeline:
 *     one video track (V1) + two audio tracks (A1 left, A2 right).
 *  5. Emits a valid FCP7 XML (XMEML v4) for direct import into Premiere.
 */

import type { SequenceModel, SequenceClip, SequenceFile } from "./fcp-xml-parser";
import { msToFrames } from "./fcp-xml-parser";

export interface ColdOpenRange {
  label: string;       // e.g. the quote text, for reference
  startMs: number;
  endMs: number;
}

interface FlatClip {
  file: SequenceFile;      // video source file
  sourceIn: number;        // frames in video source file
  sourceOut: number;
  audioFile: SequenceFile; // audio source file (may differ from video)
  audioSourceIn: number;   // frames in audio source file
  audioSourceOut: number;
  timelineStart: number;   // frames on output timeline
  timelineEnd: number;
}

function escapeXml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
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

/**
 * Find the best real-media clip of a given type that overlaps [startFrame, endFrame).
 * Skips: disabled clips, empty fileId, files not in model (adjustment layers),
 * nested sequence refs. Returns the clip with the largest overlap.
 */
function findPrimaryClip(
  model: SequenceModel,
  startFrame: number,
  endFrame: number,
  trackType: "video" | "audio"
): { clip: SequenceClip; overlapStart: number; overlapEnd: number } | null {
  let best: { clip: SequenceClip; overlapStart: number; overlapEnd: number } | null = null;
  let bestOverlap = 0;

  for (const clip of model.clips) {
    if (!clip.enabled) continue;
    if (clip.trackType !== trackType) continue;
    if (!clip.fileId) continue;
    if (!model.files[clip.fileId]) continue;
    if (clip.sequenceEnd <= startFrame) continue;
    if (clip.sequenceStart >= endFrame) continue;

    const overlapStart = Math.max(clip.sequenceStart, startFrame);
    const overlapEnd = Math.min(clip.sequenceEnd, endFrame);
    const overlap = overlapEnd - overlapStart;

    if (overlap > bestOverlap) {
      bestOverlap = overlap;
      best = { clip, overlapStart, overlapEnd };
    }
  }

  return best;
}

// ── Main assembler ───────────────────────────────────────────────────────────

/**
 * Compute the source-frame offset for a file: the difference between a clip's
 * sourceIn and its sequenceStart. This lets us convert any timeline frame to
 * the corresponding frame in a specific source file.
 */
function computeFileOffset(model: SequenceModel, fileId: string): number {
  for (const clip of model.clips) {
    if (clip.fileId === fileId && clip.enabled) {
      return clip.sourceIn - clip.sequenceStart;
    }
  }
  return 0;
}

export function assembleColdOpen(
  model: SequenceModel,
  ranges: ColdOpenRange[],
  outputSequenceName = "Cold Open",
  audioFileId?: string
): string {
  const { timebase, ntsc } = model;
  const rate = rateXml(timebase, ntsc);

  // If explicit audioFileId override, resolve it once
  const audioOverrideFile = audioFileId ? model.files[audioFileId] : null;
  const audioOverrideOffset = audioFileId ? computeFileOffset(model, audioFileId) : 0;

  // ── For each range, find the primary video + audio clips ──────────────────
  const outputClips: FlatClip[] = [];
  let timelineCursor = 0;

  for (const range of ranges) {
    const startFrame = msToFrames(range.startMs, model);
    const endFrame = msToFrames(range.endMs, model);
    const slabDuration = endFrame - startFrame;
    if (slabDuration <= 0) continue;

    const match = findPrimaryClip(model, startFrame, endFrame, "video");
    if (!match) continue;

    const { clip, overlapStart, overlapEnd } = match;
    const file = model.files[clip.fileId];

    const offsetIntoClip = overlapStart - clip.sequenceStart;
    const sourceIn = clip.sourceIn + offsetIntoClip;
    const clipDuration = overlapEnd - overlapStart;
    const sourceOut = sourceIn + clipDuration;

    // Audio: explicit override > source audio tracks > video file fallback
    let aFile: SequenceFile;
    let audioSourceIn: number;
    let audioSourceOut: number;

    if (audioOverrideFile) {
      // User explicitly chose a file for all audio
      aFile = audioOverrideFile;
      audioSourceIn = overlapStart + audioOverrideOffset;
      audioSourceOut = audioSourceIn + clipDuration;
    } else {
      // Look at what audio clip the source edit uses at this timeline position
      const audioMatch = findPrimaryClip(model, overlapStart, overlapEnd, "audio");
      if (audioMatch) {
        const audioClip = audioMatch.clip;
        aFile = model.files[audioClip.fileId];
        const audioOffset = audioMatch.overlapStart - audioClip.sequenceStart;
        audioSourceIn = audioClip.sourceIn + audioOffset;
        audioSourceOut = audioSourceIn + clipDuration;
      } else {
        // No audio track clip found — fall back to video file
        aFile = file;
        audioSourceIn = sourceIn;
        audioSourceOut = sourceOut;
      }
    }

    outputClips.push({
      file,
      sourceIn,
      sourceOut,
      audioFile: aFile,
      audioSourceIn,
      audioSourceOut,
      timelineStart: timelineCursor,
      timelineEnd: timelineCursor + clipDuration,
    });

    timelineCursor += clipDuration;
  }

  const totalDuration = timelineCursor;

  // ── Video characteristics from first file ─────────────────────────────────
  const firstFile = Object.values(model.files)[0];
  const seqWidth = firstFile?.videoWidth ?? 3840;
  const seqHeight = firstFile?.videoHeight ?? 2160;

  // Track which files have been fully defined (first = inline, rest = ref)
  const emittedFileIds = new Set<string>();
  let clipIdCounter = 1;

  function fileRefXml(file: SequenceFile): string {
    if (!emittedFileIds.has(file.id)) {
      emittedFileIds.add(file.id);
      return fullFileXml(file, rate);
    }
    return `<file id="${escapeXml(file.id)}"/>`;
  }

  // ── Build V1 clipitems ────────────────────────────────────────────────────
  const videoClipItems = outputClips.map(oc => {
    const id = `clipitem-${clipIdCounter++}`;
    return `          <clipitem id="${id}">
            <masterclipid>masterclip-${escapeXml(oc.file.id)}</masterclipid>
            <name>${escapeXml(oc.file.name)}</name>
            <enabled>TRUE</enabled>
            <duration>${oc.file.durationFrames}</duration>
            ${rate}
            <start>${oc.timelineStart}</start>
            <end>${oc.timelineEnd}</end>
            <in>${oc.sourceIn}</in>
            <out>${oc.sourceOut}</out>
            <alphatype>none</alphatype>
            <pixelaspectratio>square</pixelaspectratio>
            <anamorphic>FALSE</anamorphic>
            ${fileRefXml(oc.file)}
            <logginginfo><description></description><scene></scene><shottake></shottake><lognote></lognote><good></good></logginginfo>
          </clipitem>`;
  }).join("\n");

  // ── Build A1 (left) and A2 (right) clipitems ─────────────────────────────
  function audioClipItems(channelIndex: number): string {
    return outputClips.map(oc => {
      const id = `clipitem-${clipIdCounter++}`;
      return `          <clipitem id="${id}">
            <masterclipid>masterclip-${escapeXml(oc.audioFile.id)}</masterclipid>
            <name>${escapeXml(oc.audioFile.name)}</name>
            <enabled>TRUE</enabled>
            <duration>${oc.audioFile.durationFrames}</duration>
            ${rate}
            <start>${oc.timelineStart}</start>
            <end>${oc.timelineEnd}</end>
            <in>${oc.audioSourceIn}</in>
            <out>${oc.audioSourceOut}</out>
            <sourcetrack>
              <mediatype>audio</mediatype>
              <trackindex>${channelIndex}</trackindex>
            </sourcetrack>
            ${fileRefXml(oc.audioFile)}
            <logginginfo><description></description><scene></scene><shottake></shottake><lognote></lognote><good></good></logginginfo>
          </clipitem>`;
    }).join("\n");
  }

  const audioTrack1 = audioClipItems(1);
  const audioTrack2 = audioClipItems(2);

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
        <track>
${videoClipItems}
          <enabled>TRUE</enabled>
          <locked>FALSE</locked>
        </track>
      </video>
      <audio>
        <numOutputChannels>2</numOutputChannels>
        <format>
          <samplecharacteristics>
            <depth>16</depth>
            <samplerate>48000</samplerate>
          </samplecharacteristics>
        </format>
        <track>
${audioTrack1}
          <enabled>TRUE</enabled>
          <locked>FALSE</locked>
          <outputchannelindex>1</outputchannelindex>
        </track>
        <track>
${audioTrack2}
          <enabled>TRUE</enabled>
          <locked>FALSE</locked>
          <outputchannelindex>2</outputchannelindex>
        </track>
      </audio>
    </media>
  </sequence>
</xmeml>`;
}
