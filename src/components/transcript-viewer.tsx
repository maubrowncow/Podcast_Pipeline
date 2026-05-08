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

  if (loading)
    return (
      <p className="text-[10px] text-muted-foreground uppercase tracking-[0.14em]">
        Loading transcript...
      </p>
    );
  if (error)
    return (
      <p className="text-[10px] text-error uppercase tracking-[0.14em]">{error}</p>
    );
  if (!transcript) return null;

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
          <h2 className="text-xs font-bold uppercase tracking-[0.14em] flex items-center gap-2">
            <span className="inline-block w-2 h-2 bg-accent-green" />
            Transcript
          </h2>
          <span className="text-[10px] text-muted-foreground uppercase tracking-[0.14em]">
            {transcript.segments.length} segments
            {speakerCount > 0 && ` \u00B7 ${speakerCount} speakers`}
          </span>
        </div>
        <a
          href={`/api/jobs/${jobId}/transcript?download=true`}
          data-slot="bracket-btn"
          className="text-[10px] font-bold uppercase tracking-[0.14em] text-muted-foreground hover:text-accent transition-colors"
        >
          JSON
        </a>
      </div>

      <div className="border border-border bg-card p-4">
        {transcript.segments.map((segment, i) => (
          <SegmentRow key={i} segment={segment} speakerIndex={speakerIndex} />
        ))}
      </div>
    </div>
  );
}
