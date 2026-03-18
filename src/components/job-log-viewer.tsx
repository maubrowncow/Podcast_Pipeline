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

  // Always render when active — show connection state even if no logs yet
  if (!isActive && logs.length === 0) return null;

  return (
    <div className="mt-4">
      {logs.length > 0 ? (
        <div className="max-h-80 overflow-y-auto">
          <ul className="space-y-1.5">
            {logs.map((log) => (
              <li key={log.id} className="flex gap-3 text-sm leading-relaxed">
                <span className="text-muted shrink-0 tabular-nums text-xs pt-0.5">
                  {new Date(log.createdAt).toLocaleTimeString()}
                </span>
                <span
                  className={
                    log.level === "error"
                      ? "text-error"
                      : log.level === "warn"
                      ? "text-amber-600"
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
        <p className="text-sm text-muted">Connecting to log stream...</p>
      )}
      {isActive && (
        <div className="flex items-center gap-2 mt-3 text-xs text-muted">
          <span className={`inline-block w-1.5 h-1.5 rounded-full ${connected ? "bg-green-500" : "bg-amber-500"} animate-pulse`} />
          {connected ? "Listening for updates..." : "Reconnecting..."}
        </div>
      )}
    </div>
  );
}
