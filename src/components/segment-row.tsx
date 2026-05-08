"use client";

import { useState } from "react";
import { WordDetail } from "./word-detail";

const SPEAKER_COLORS = [
  "text-accent-blue",
  "text-accent-green",
  "text-accent-yellow",
  "text-accent-red",
  "text-cold-grey",
  "text-muted-foreground",
];

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

function formatTimestamp(seconds: number): string {
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = Math.floor(seconds % 60);
  return `${h.toString().padStart(2, "0")}:${m.toString().padStart(2, "0")}:${s.toString().padStart(2, "0")}`;
}

export function SegmentRow({
  segment,
  speakerIndex,
}: {
  segment: Segment;
  speakerIndex: Map<string, number>;
}) {
  const [expanded, setExpanded] = useState(false);

  const speakerColorIdx = segment.speaker
    ? speakerIndex.get(segment.speaker) ?? 0
    : 0;
  const speakerColor = SPEAKER_COLORS[speakerColorIdx % SPEAKER_COLORS.length];

  return (
    <div className="border-b border-border py-2.5 last:border-b-0">
      <div
        className="flex gap-3 cursor-pointer group"
        onClick={() => setExpanded(!expanded)}
      >
        <span className="text-[10px] text-muted-foreground shrink-0 pt-0.5 w-20 tabular-nums tracking-[0.08em]">
          {formatTimestamp(segment.start)}
        </span>
        {segment.speaker && (
          <span
            className={`text-[10px] font-bold uppercase tracking-[0.14em] shrink-0 pt-0.5 w-24 ${speakerColor}`}
          >
            {segment.speaker}
          </span>
        )}
        <p className="text-xs flex-1 leading-relaxed tracking-[0.04em]">
          {segment.text}
          <span className="text-muted-foreground text-[10px] ml-2 opacity-0 group-hover:opacity-100 transition-opacity">
            {expanded ? "\u25B2" : "\u25BC"}
          </span>
        </p>
      </div>

      {expanded && segment.words && segment.words.length > 0 && (
        <div className="mt-2 ml-20 pl-3 border-l-2 border-border">
          <div className="flex flex-wrap gap-1">
            {segment.words.map((word, i) => (
              <WordDetail key={i} word={word} />
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
