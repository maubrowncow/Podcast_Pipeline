/**
 * FCP7 XML (XMEML) parser.
 * Reads a Premiere Pro "Export Final Cut Pro XML" file and builds a
 * SequenceModel — the typed timeline representation we use for conforming.
 */

import { XMLParser } from "fast-xml-parser";

// ─── Public types ────────────────────────────────────────────────────────────

export interface SequenceFile {
  id: string;
  name: string;
  pathurl: string;
  durationFrames: number;
  // Video characteristics (for assembler output)
  videoWidth?: number;
  videoHeight?: number;
  pixelAspectRatio?: string;
  fieldDominance?: string;
  // Audio characteristics
  audioDepth?: number;
  audioSampleRate?: number;
  audioChannelCount?: number;
  audioLayout?: string;
  // File timecode
  timecodeFrame?: number;
  timecodeDisplayFormat?: string;
}

export interface SequenceClip {
  id: string;
  name: string;
  enabled: boolean;
  trackType: "video" | "audio";
  trackIndex: number;       // 0-based
  // all in frames, relative to sequence start (frame 0)
  sequenceStart: number;
  sequenceEnd: number;
  sourceIn: number;
  sourceOut: number;
  fileId: string;
}

export interface SequenceModel {
  name: string;
  timebase: number;         // e.g. 30, 24, 25
  ntsc: boolean;            // true = 29.97 / 23.976
  startTimecodeFrame: number; // sequence start offset (usually 0)
  durationFrames: number;
  files: Record<string, SequenceFile>;
  clips: SequenceClip[];
}

// ─── Frame / ms helpers ──────────────────────────────────────────────────────

export function framesToMs(frames: number, model: SequenceModel): number {
  const fps = model.ntsc ? model.timebase * 1000 / 1001 : model.timebase;
  return Math.round((frames / fps) * 1000);
}

export function msToFrames(ms: number, model: SequenceModel): number {
  const fps = model.ntsc ? model.timebase * 1000 / 1001 : model.timebase;
  return Math.round((ms / 1000) * fps);
}

// ─── Parser ──────────────────────────────────────────────────────────────────

export function parseFCPXML(xmlString: string): SequenceModel {
  const parser = new XMLParser({
    ignoreAttributes: false,
    attributeNamePrefix: "@_",
    isArray: (name) =>
      ["track", "clipitem", "file", "sequence"].includes(name),
  });

  const doc = parser.parse(xmlString);
  const xmeml = doc.xmeml ?? doc;
  const seqRaw = xmeml.sequence ?? xmeml?.xmeml?.sequence;
  const seq = Array.isArray(seqRaw) ? seqRaw[0] : seqRaw;
  if (!seq) throw new Error("No <sequence> element found in XML");

  // ── Sequence rate ──────────────────────────────────────────────────────────
  const rateEl = seq.rate ?? {};
  const timebase = Number(rateEl.timebase ?? 30);
  const ntsc = String(rateEl.ntsc ?? "FALSE").toUpperCase() === "TRUE";

  // ── Start timecode ─────────────────────────────────────────────────────────
  let startTimecodeFrame = 0;
  if (seq.timecode?.frame != null) {
    startTimecodeFrame = Number(seq.timecode.frame);
  }

  const durationFrames = Number(seq.duration ?? 0);
  const name = String(seq.name ?? "Sequence");

  // ── Collect file definitions ───────────────────────────────────────────────
  const files: Record<string, SequenceFile> = {};

  function collectFiles(node: unknown) {
    if (!node || typeof node !== "object") return;
    if (Array.isArray(node)) { node.forEach(collectFiles); return; }
    const obj = node as Record<string, unknown>;
    if ("pathurl" in obj && "@_id" in obj) {
      const id = String(obj["@_id"]);
      const file: SequenceFile = {
        id,
        name: String(obj.name ?? ""),
        pathurl: String(obj.pathurl ?? ""),
        durationFrames: Number(obj.duration ?? 0),
      };

      // Extract video characteristics
      const mediaEl = obj.media as Record<string, unknown> | undefined;
      if (mediaEl) {
        const videoEl = mediaEl.video as Record<string, unknown> | undefined;
        if (videoEl) {
          const sc = videoEl.samplecharacteristics as Record<string, unknown> | undefined;
          if (sc) {
            if (sc.width) file.videoWidth = Number(sc.width);
            if (sc.height) file.videoHeight = Number(sc.height);
            if (sc.pixelaspectratio) file.pixelAspectRatio = String(sc.pixelaspectratio);
            if (sc.fielddominance) file.fieldDominance = String(sc.fielddominance);
          }
        }
        // Extract audio characteristics (first audio block)
        const audioEl = mediaEl.audio;
        const firstAudio = Array.isArray(audioEl) ? audioEl[0] : audioEl;
        if (firstAudio && typeof firstAudio === "object") {
          const a = firstAudio as Record<string, unknown>;
          const asc = a.samplecharacteristics as Record<string, unknown> | undefined;
          if (asc) {
            if (asc.depth) file.audioDepth = Number(asc.depth);
            if (asc.samplerate) file.audioSampleRate = Number(asc.samplerate);
          }
          if (a.channelcount) file.audioChannelCount = Number(a.channelcount);
          if (a.layout) file.audioLayout = String(a.layout);
        }
      }

      // Extract file timecode
      const tcEl = obj.timecode as Record<string, unknown> | undefined;
      if (tcEl) {
        if (tcEl.frame != null) file.timecodeFrame = Number(tcEl.frame);
        if (tcEl.displayformat) file.timecodeDisplayFormat = String(tcEl.displayformat);
      }

      files[id] = file;
    }
    for (const v of Object.values(obj)) collectFiles(v);
  }
  collectFiles(seq);

  // ── Parse tracks (with nested sequence recursion) ─────────────────────────
  const clips: SequenceClip[] = [];

  function parseTracksFromMedia(media: Record<string, unknown>) {
    const videoSection = media.video as Record<string, unknown> | undefined;
    const audioSection = media.audio as Record<string, unknown> | undefined;
    const videoTracks = videoSection?.track ?? [];
    const audioTracks = audioSection?.track ?? [];
    parseTracks(Array.isArray(videoTracks) ? videoTracks : [], "video", 0);
    parseTracks(Array.isArray(audioTracks) ? audioTracks : [], "audio", 0);
  }

  function parseTracks(
    trackList: unknown[],
    trackType: "video" | "audio",
    startIndex: number
  ) {
    trackList.forEach((track: unknown, idx: number) => {
      if (!track || typeof track !== "object") return;
      const t = track as Record<string, unknown>;
      const clipItems = t.clipitem;
      if (!Array.isArray(clipItems)) return;
      clipItems.forEach((ci: unknown) => {
        if (!ci || typeof ci !== "object") return;
        const c = ci as Record<string, unknown>;

        // If this clipitem contains a nested sequence, recurse into it
        const nestedSeq = c.sequence;
        if (nestedSeq) {
          const inner = Array.isArray(nestedSeq) ? nestedSeq[0] : nestedSeq;
          if (inner && typeof inner === "object") {
            const innerMedia = (inner as Record<string, unknown>).media;
            if (innerMedia && typeof innerMedia === "object") {
              parseTracksFromMedia(innerMedia as Record<string, unknown>);
              return; // Don't add the wrapper clip itself
            }
          }
        }

        const seqStart = Number(c.start ?? -1);
        const seqEnd = Number(c.end ?? -1);
        if (seqStart < 0 || seqEnd < 0) return; // gap / spacer

        // Resolve fileId — may be inline or a reference
        let fileId = "";
        const fileEl = c.file;
        if (fileEl && typeof fileEl === "object" && !Array.isArray(fileEl)) {
          const f = fileEl as Record<string, unknown>;
          fileId = String(f["@_id"] ?? "");
        } else if (Array.isArray(fileEl) && fileEl.length > 0) {
          fileId = String((fileEl[0] as Record<string, unknown>)["@_id"] ?? "");
        }

        const enabled = String(c.enabled ?? "TRUE").toUpperCase() === "TRUE";

        clips.push({
          id: String((c as Record<string, unknown>)["@_id"] ?? `clip-${clips.length}`),
          name: String(c.name ?? ""),
          enabled,
          trackType,
          trackIndex: startIndex + idx,
          sequenceStart: seqStart,
          sequenceEnd: seqEnd,
          sourceIn: Number(c.in ?? 0),
          sourceOut: Number(c.out ?? seqEnd - seqStart),
          fileId,
        });
      });
    });
  }

  const media = seq.media ?? {};
  parseTracksFromMedia(media as Record<string, unknown>);

  return { name, timebase, ntsc, startTimecodeFrame, durationFrames, files, clips };
}
