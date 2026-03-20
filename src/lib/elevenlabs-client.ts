import fs from "node:fs";
import path from "node:path";

export interface ElevenLabsWord {
  text: string;
  type: "word" | "audio_event";
  start: number;
  end: number;
  speaker_id?: string;
  logprob?: number;
}

export interface ElevenLabsSegment {
  start: number;
  end: number;
  text: string;
  speaker?: string;
  words: ElevenLabsWord[];
}

export interface ElevenLabsEvent {
  type: string;
  start: number;
  end: number;
}

export interface ElevenLabsResult {
  text: string;
  segments: ElevenLabsSegment[];
  words: ElevenLabsWord[];
  raw_events: ElevenLabsEvent[];
  event_summary: Record<string, number>;
  language: string;
  duration_seconds: number;
}

export async function transcribeFile(
  filePath: string,
  numSpeakers?: number
): Promise<ElevenLabsResult> {
  const apiKey = process.env.ELEVENLABS_API_KEY;
  if (!apiKey) throw new Error("ELEVENLABS_API_KEY not set");

  const fileBuffer = fs.readFileSync(filePath);
  const filename = path.basename(filePath);

  const formData = new FormData();
  formData.append("file", new Blob([fileBuffer]), filename);
  formData.append("model_id", "scribe_v1");
  formData.append("language_code", "en");
  formData.append("diarize", "true");
  formData.append("timestamps_granularity", "word");
  formData.append("tag_audio_events", "true");
  if (numSpeakers) formData.append("num_speakers", String(numSpeakers));

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 60 * 60 * 1000); // 1hr

  try {
    const res = await fetch("https://api.elevenlabs.io/v1/speech-to-text", {
      method: "POST",
      headers: { "xi-api-key": apiKey },
      body: formData,
      signal: controller.signal,
    });

    if (!res.ok) {
      const err = await res.text();
      throw new Error(`ElevenLabs error (${res.status}): ${err}`);
    }

    const raw = await res.json() as { text: string; words: ElevenLabsWord[]; language_code?: string };
    return processResponse(raw);
  } finally {
    clearTimeout(timeout);
  }
}

function processResponse(raw: { text: string; words: ElevenLabsWord[]; language_code?: string }): ElevenLabsResult {
  const words = raw.words ?? [];

  // Separate audio events from speech words
  const speechWords = words.filter(w => w.type === "word");
  const eventWords = words.filter(w => w.type === "audio_event");

  // Build segments by grouping consecutive words from the same speaker
  const segments: ElevenLabsSegment[] = [];
  let currentSegment: ElevenLabsSegment | null = null;

  for (const word of speechWords) {
    const speaker = word.speaker_id;
    if (!currentSegment || currentSegment.speaker !== speaker) {
      if (currentSegment) segments.push(currentSegment);
      currentSegment = { start: word.start, end: word.end, text: word.text, speaker, words: [word] };
    } else {
      currentSegment.text += " " + word.text;
      currentSegment.end = word.end;
      currentSegment.words.push(word);
    }
  }
  if (currentSegment) segments.push(currentSegment);

  // Build raw events with timecodes
  const raw_events: ElevenLabsEvent[] = eventWords.map(w => ({
    type: w.text.replace(/[()]/g, "").toLowerCase(),
    start: w.start,
    end: w.end,
  }));

  const event_summary: Record<string, number> = {};
  for (const e of raw_events) {
    event_summary[e.type] = (event_summary[e.type] ?? 0) + 1;
  }

  const duration = speechWords.length > 0
    ? speechWords[speechWords.length - 1].end
    : 0;

  return {
    text: raw.text,
    segments,
    words,
    raw_events,
    event_summary,
    language: raw.language_code ?? "en",
    duration_seconds: duration,
  };
}
