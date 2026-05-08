"use client";

import { useEffect, useState, useRef } from "react";

interface LogEntry {
  id: number;
  level: string;
  message: string;
  createdAt: string;
}

export function JobLogViewer({ jobId, isActive }: { jobId: number; isActive: boolean }) {
  const [logs, setLogs] = useState<LogEntry[]>([]);
  const [connected, setConnected] = useState(false);
  const bottomRef = useRef<HTMLDivElement>(null);
  const eventSourceRef = useRef<EventSource | null>(null);

  useEffect(() => {
    if (eventSourceRef.current) {
      eventSourceRef.current.close();
      eventSourceRef.current = null;
    }

    const eventSource = new EventSource(`/api/jobs/${jobId}/logs`);
    eventSourceRef.current = eventSource;

    eventSource.onopen = () => {
      setConnected(true);
    };

    eventSource.onmessage = (event) => {
      try {
        const log: LogEntry = JSON.parse(event.data);
        setLogs((prev) => {
          if (prev.some((l) => l.id === log.id)) return prev;
          return [...prev, log];
        });
      } catch (e) {
        console.error("Failed to parse log event:", e);
      }
    };

    eventSource.onerror = () => {
      setConnected(false);
      if (!isActive) {
        eventSource.close();
        eventSourceRef.current = null;
      }
    };

    return () => {
      eventSource.close();
      eventSourceRef.current = null;
    };
  }, [jobId, isActive]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [logs]);

  if (!isActive && logs.length === 0) return null;

  return (
    <div className="mt-4">
      {logs.length > 0 ? (
        <div className="max-h-80 overflow-y-auto border border-border bg-card p-4">
          <ul className="space-y-1">
            {logs.map((log) => (
              <li key={log.id} className="flex gap-3 text-xs leading-relaxed tracking-[0.08em]">
                <span className="text-muted-foreground shrink-0 tabular-nums text-[10px] pt-0.5">
                  {new Date(log.createdAt).toLocaleTimeString()}
                </span>
                <span
                  className={
                    log.level === "error"
                      ? "text-error"
                      : log.level === "warn"
                      ? "text-accent-yellow"
                      : "text-foreground"
                  }
                >
                  {log.message}
                </span>
              </li>
            ))}
          </ul>
          <div ref={bottomRef} />
        </div>
      ) : (
        <p className="text-[10px] text-muted-foreground uppercase tracking-[0.14em]">
          Connecting to log stream...
        </p>
      )}
      {isActive && (
        <div className="flex items-center gap-2 mt-3 text-[10px] text-muted-foreground uppercase tracking-[0.14em]">
          <span
            className={`inline-block w-1.5 h-1.5 rounded-full ${
              connected ? "bg-accent-green" : "bg-accent-yellow"
            } animate-pulse`}
          />
          {connected ? "Listening..." : "Reconnecting..."}
        </div>
      )}
    </div>
  );
}
