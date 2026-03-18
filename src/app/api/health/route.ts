import { NextResponse } from "next/server";

export const runtime = "nodejs";

export async function GET() {
  const whisperxUrl = process.env.WHISPERX_URL || "http://localhost:9000";

  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 5000);

    const res = await fetch(`${whisperxUrl}/health`, {
      signal: controller.signal,
    });
    clearTimeout(timeout);

    if (!res.ok) {
      return NextResponse.json({
        app: "online",
        whisperx: "error",
        details: `WhisperX returned status ${res.status}`,
      });
    }

    const data = await res.json();
    return NextResponse.json({
      app: "online",
      whisperx: "online",
      model: data.model,
      device: data.device,
      gpu: data.gpu_name,
    });
  } catch {
    return NextResponse.json({
      app: "online",
      whisperx: "offline",
      details: "WhisperX server is not reachable",
    });
  }
}
