import fs from "node:fs";
import path from "node:path";

export interface SenseVoiceEvent {
  type: string;
  start: number;
  end: number;
  context_text: string;
}

export interface SenseVoiceSegment {
  start: number;
  end: number;
  text: string;
  raw_text: string;
  events: string[];
}

export interface SenseVoiceResult {
  events: SenseVoiceEvent[];
  segments: SenseVoiceSegment[];
  summary: Record<string, number>;
  total_events: number;
  total_segments: number;
  processing_seconds: number;
}

export async function detectEvents(
  filePath: string
): Promise<SenseVoiceResult> {
  const sensevoiceUrl = process.env.SENSEVOICE_URL || "http://localhost:9001";

  const fileBuffer = fs.readFileSync(filePath);
  const filename = path.basename(filePath);

  const formData = new FormData();
  formData.append("file", new Blob([fileBuffer]), filename);
  formData.append("language", "en");

  const controller = new AbortController();
  // 30 minute timeout for large files
  const timeout = setTimeout(() => controller.abort(), 30 * 60 * 1000);

  try {
    const res = await fetch(`${sensevoiceUrl}/detect`, {
      method: "POST",
      body: formData,
      signal: controller.signal,
    });

    if (!res.ok) {
      const errorText = await res.text();
      throw new Error(`SenseVoice error (${res.status}): ${errorText}`);
    }

    return (await res.json()) as SenseVoiceResult;
  } finally {
    clearTimeout(timeout);
  }
}
