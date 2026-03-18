"use client";

import { useEffect, useState } from "react";

interface HealthData {
  app: string;
  whisperx: string;
  model?: string;
  device?: string;
  gpu?: string;
  details?: string;
}

export function HealthIndicator() {
  const [health, setHealth] = useState<HealthData | null>(null);

  useEffect(() => {
    const check = async () => {
      try {
        const res = await fetch("/api/health");
        setHealth(await res.json());
      } catch {
        setHealth({ app: "online", whisperx: "offline" });
      }
    };

    check();
    const interval = setInterval(check, 30000);
    return () => clearInterval(interval);
  }, []);

  const isOnline = health?.whisperx === "online";

  return (
    <div className="flex items-center gap-2 text-sm text-muted" title={
      health
        ? `WhisperX: ${health.whisperx}${health.model ? ` | Model: ${health.model}` : ""}${health.gpu ? ` | GPU: ${health.gpu}` : ""}`
        : "Checking..."
    }>
      <div
        className={`w-2 h-2 rounded-full ${
          health === null
            ? "bg-muted"
            : isOnline
              ? "bg-success"
              : "bg-error"
        }`}
      />
      <span>WhisperX</span>
    </div>
  );
}
