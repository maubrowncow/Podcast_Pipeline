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
    <div
      className="flex items-center gap-2 text-[10px] font-bold uppercase tracking-[0.14em] text-muted-foreground"
      title={
        health
          ? `WhisperX: ${health.whisperx}${health.model ? ` | Model: ${health.model}` : ""}${health.gpu ? ` | GPU: ${health.gpu}` : ""}`
          : "Checking..."
      }
    >
      <span
        className={`inline-block w-1.5 h-1.5 rounded-full ${
          health === null
            ? "bg-muted-foreground"
            : isOnline
              ? "bg-accent-green"
              : "bg-error"
        }`}
      />
      <span>Scribe</span>
    </div>
  );
}
