"use client";

import { useEffect, useState } from "react";
import { SegmentRow } from "./segment-row";

interface Word {
  word: string;
  start: number;
  end: number;
  score: number;
  speaker?: string;
}

interface Segment {
  start: number;
  end: number;
  text: string;
  speaker?: string;
  words: Word[];
}

interface TranscriptData {
  text: string;
  segments: Segment[];
  language: string;
  duration_seconds: number;
  processing_seconds: number;
}

export function TranscriptViewer({ jobId }: { jobId: number }) {
  const [transcript, setTranscript] = useState<TranscriptData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    async function load() {
      try {
        const res = await fetch(`/api/jobs/${jobId}/transcript`);
        if (!res.ok) {
          setError("Transcript not available");
          return;
        }
        setTranscript(await res.json());
      } catch {
        setError("Failed to load transcript");
      } finally {
        setLoading(false);
      }
    }
    load();
  }, [jobId]);

  if (loading) return <p className="text-muted text-sm">Loading transcript...</p>;
  if (error) return <p className="text-error text-sm">{error}</p>;
  if (!transcript) return null;

  // Build speaker index for consistent coloring
  const speakerIndex = new Map<string, number>();
  let speakerCount = 0;
  for (const seg of transcript.segments) {
    if (seg.speaker && !speakerIndex.has(seg.speaker)) {
      speakerIndex.set(seg.speaker, speakerCount++);
    }
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-3">
          <h2 className="text-lg font-semibold">Transcript</h2>
          <span className="text-xs text-muted">
            {transcript.segments.length} segments
            {speakerCount > 0 && ` · ${speakerCount} speakers`}
          </span>
        </div>
        <a
          href={`/api/jobs/${jobId}/transcript?download=true`}
          className="px-3 py-1.5 text-sm border border-border rounded-lg hover:bg-card transition-colors"
        >
          Download JSON
        </a>
      </div>

      <div className="border border-border rounded-lg bg-card p-4">
        {transcript.segments.map((segment, i) => (
          <SegmentRow key={i} segment={segment} speakerIndex={speakerIndex} />
        ))}
      </div>
    </div>
  );
}
