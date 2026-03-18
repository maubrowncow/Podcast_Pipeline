import fs from "node:fs";
import path from "node:path";

export interface WhisperXWord {
  word: string;
  start: number;
  end: number;
  score: number;
  speaker?: string;
}

export interface WhisperXSegment {
  start: number;
  end: number;
  text: string;
  speaker?: string;
  words: WhisperXWord[];
}

export interface WhisperXResult {
  text: string;
  segments: WhisperXSegment[];
  language: string;
  duration_seconds: number;
  processing_seconds: number;
  realtime_factor: number;
}

export async function transcribeFile(
  filePath: string
): Promise<WhisperXResult> {
  const whisperxUrl = process.env.WHISPERX_URL || "http://localhost:9000";

  const fileBuffer = fs.readFileSync(filePath);
  const filename = path.basename(filePath);

  const formData = new FormData();
  formData.append("file", new Blob([fileBuffer]), filename);
  formData.append("align", "true");

  const controller = new AbortController();
  // 30 minute timeout for large files
  const timeout = setTimeout(() => controller.abort(), 30 * 60 * 1000);

  try {
    const res = await fetch(`${whisperxUrl}/transcribe`, {
      method: "POST",
      body: formData,
      signal: controller.signal,
    });

    if (!res.ok) {
      const errorText = await res.text();
      throw new Error(`WhisperX error (${res.status}): ${errorText}`);
    }

    return (await res.json()) as WhisperXResult;
  } finally {
    clearTimeout(timeout);
  }
}
