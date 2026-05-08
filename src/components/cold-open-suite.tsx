"use client";

import { useEffect, useState, useRef } from "react";

interface SequenceFileInfo {
  id: string;
  name: string;
}

interface SequenceInfo {
  sequenceName: string;
  timebase: number;
  ntsc: boolean;
  durationFrames: number;
  tracks: { video: number; audio: number };
  clipCount: number;
  files?: SequenceFileInfo[];
}

interface ColdOpenQuote {
  text: string;
  beat: string;
  emotion: string;
  reason: string;
}

interface ColdOpenVariation {
  strategy: string;
  strategyLabel: string;
  storyShape: string;
  hook: string;
  quotes: ColdOpenQuote[];
  openLoop: string;
  totalWordCount?: number;
  totalEstimatedSeconds: number;
}

interface ColdOpenScript {
  variations: ColdOpenVariation[];
}

interface LegacyScript {
  hook: string;
  quotes: Array<{ text: string; reason: string }>;
  totalEstimatedSeconds: number;
}

function isLegacyScript(s: unknown): s is LegacyScript {
  return !!s && typeof s === "object" && "hook" in s && !("variations" in s);
}

const EMOTION_COLORS: Record<string, string> = {
  surprise: "text-accent-yellow",
  vulnerability: "text-accent-red",
  curiosity: "text-accent-blue",
  humor: "text-accent-green",
  controversy: "text-accent-red",
  conviction: "text-cold-grey",
  unknown: "text-muted-foreground",
};

const STRATEGY_BORDER: Record<string, string> = {
  hot_take: "border-accent-red",
  vulnerable_moment: "border-accent-red",
  mystery: "border-accent-blue",
  classic: "border-border",
};

export function ColdOpenSuite({ jobId }: { jobId: number }) {
  const [sequence, setSequence] = useState<SequenceInfo | null>(null);
  const [script, setScript] = useState<ColdOpenScript | null>(null);
  const [selectedIndex, setSelectedIndex] = useState<number>(0);
  const [status, setStatus] = useState<"idle" | "uploading" | "generating" | "downloading">("idle");
  const [error, setError] = useState<string | null>(null);
  const [sequenceName, setSequenceName] = useState("Cold Open");
  const [confirmRegenerate, setConfirmRegenerate] = useState(false);
  const [direction, setDirection] = useState("");
  const [audioFileId, setAudioFileId] = useState<string>("");
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    fetch(`/api/jobs/${jobId}/premiere-xml`)
      .then(r => r.json())
      .then(d => { if (d.sequenceName) setSequence(d); })
      .catch(() => {});

    fetch(`/api/jobs/${jobId}/cold-open`)
      .then(r => r.json())
      .then(d => {
        if (d.script) {
          if (isLegacyScript(d.script)) {
            setScript({
              variations: [{
                strategy: "classic",
                strategyLabel: "Classic",
                storyShape: "unknown",
                hook: d.script.hook,
                quotes: d.script.quotes.map((q: { text: string; reason: string }) => ({
                  ...q,
                  beat: "arc",
                  emotion: "unknown",
                })),
                openLoop: "",
                totalEstimatedSeconds: d.script.totalEstimatedSeconds,
              }],
            });
          } else {
            setScript(d.script);
          }
          if (typeof d.selectedIndex === "number") {
            setSelectedIndex(d.selectedIndex);
          }
        }
      })
      .catch(() => {});
  }, [jobId]);

  async function handleXmlUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setStatus("uploading");
    setError(null);
    const formData = new FormData();
    formData.append("file", file);
    try {
      const res = await fetch(`/api/jobs/${jobId}/premiere-xml`, {
        method: "POST",
        body: formData,
      });
      const data = await res.json();
      if (!res.ok) { setError(data.error ?? "Upload failed"); return; }
      setSequence(data);
    } catch {
      setError("Upload failed");
    } finally {
      setStatus("idle");
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  }

  async function handleGenerateColdOpen() {
    if (script && !confirmRegenerate) {
      setConfirmRegenerate(true);
      return;
    }
    setConfirmRegenerate(false);
    setStatus("generating");
    setError(null);
    setScript(null);
    setSelectedIndex(0);
    try {
      const res = await fetch(`/api/jobs/${jobId}/cold-open`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ direction: direction.trim() || undefined }),
      });
      const data = await res.json();
      if (!res.ok) { setError(data.error ?? "Generation failed"); return; }
      setScript(data.script);
    } catch {
      setError("Generation failed");
    } finally {
      setStatus("idle");
    }
  }

  async function handleSelectVariation(index: number) {
    setSelectedIndex(index);
    fetch(`/api/jobs/${jobId}/cold-open/select`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ index }),
    }).catch(() => {});
  }

  async function handleDownloadXml() {
    if (!script || !script.variations[selectedIndex]) return;
    setStatus("downloading");
    setError(null);

    const variation = script.variations[selectedIndex];
    const allQuotes = [
      { text: variation.hook, label: "HOOK" },
      ...variation.quotes.map((q, i) => ({ text: q.text, label: `Quote ${i + 1}` })),
    ];

    try {
      const res = await fetch(`/api/jobs/${jobId}/cold-open-xml`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          quotes: allQuotes,
          sequenceName: `${sequenceName} \u2014 ${variation.strategyLabel}`,
          audioFileId: audioFileId || undefined,
        }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        setError(data.error ?? "XML generation failed");
        return;
      }
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      const strategySlug = variation.strategy.replace(/_/g, "-");
      a.download = `cold_open_${strategySlug}.xml`;
      a.click();
      URL.revokeObjectURL(url);
    } catch {
      setError("XML generation failed");
    } finally {
      setStatus("idle");
    }
  }

  const busy = status !== "idle";
  const currentVariation = script?.variations[selectedIndex];

  return (
    <div>
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-xs font-bold uppercase tracking-[0.14em] flex items-center gap-2">
          <span className="inline-block w-2 h-2 bg-accent-red" />
          Cold Open
        </h2>
        {currentVariation && (
          <span className="text-[10px] text-muted-foreground uppercase tracking-[0.14em]">
            ~{currentVariation.totalEstimatedSeconds}s &middot; {currentVariation.totalWordCount ?? "?"} words &middot; {1 + currentVariation.quotes.length} quotes
          </span>
        )}
      </div>

      {/* Step 1 */}
      <div className="border border-border bg-card p-4 mb-2">
        <div className="flex items-center justify-between">
          <div>
            <p className="text-[11px] font-bold uppercase tracking-[0.14em]">
              {sequence ? "Sequence Loaded" : "Step 1 \u2014 Upload XML"}
            </p>
            {sequence ? (
              <p className="text-[10px] text-muted-foreground tracking-[0.08em] mt-0.5">
                {sequence.sequenceName} &middot; {sequence.timebase}{sequence.ntsc ? "/0.97" : ""} fps &middot;
                V{sequence.tracks.video} A{sequence.tracks.audio} &middot; {sequence.clipCount} clips
              </p>
            ) : (
              <p className="text-[10px] text-muted-foreground tracking-[0.08em] mt-0.5">
                File &rarr; Export &rarr; Final Cut Pro XML
              </p>
            )}
          </div>
          <div className="flex items-center gap-3">
            {sequence && (
              <span className="text-[10px] font-bold text-accent-green uppercase tracking-[0.14em]">
                Ready
              </span>
            )}
            <label
              data-slot="bracket-btn"
              className={`text-[10px] font-bold uppercase tracking-[0.14em] cursor-pointer transition-colors ${
                busy
                  ? "opacity-40 pointer-events-none text-muted-foreground"
                  : "text-muted-foreground hover:text-accent"
              }`}
            >
              {status === "uploading" ? "Uploading\u2026" : sequence ? "Replace" : "Upload"}
              <input
                ref={fileInputRef}
                type="file"
                accept=".xml"
                className="hidden"
                onChange={handleXmlUpload}
                disabled={busy}
              />
            </label>
          </div>
        </div>
      </div>

      {/* Step 2 */}
      <div className="border border-border bg-card p-4 mb-2">
        <div className="flex items-center justify-between">
          <div>
            <p className="text-[11px] font-bold uppercase tracking-[0.14em]">
              Step 2 &mdash; Generate Scripts
            </p>
            <p className="text-[10px] text-muted-foreground tracking-[0.08em] mt-0.5">
              3 variations with different emotional strategies
            </p>
          </div>
          <div className="flex items-center gap-3">
            {confirmRegenerate && (
              <span className="text-[10px] font-bold text-accent-yellow uppercase tracking-[0.14em]">
                Confirm?
              </span>
            )}
            <button
              onClick={handleGenerateColdOpen}
              disabled={busy}
              data-slot="bracket-btn"
              className={`text-[10px] font-bold uppercase tracking-[0.14em] transition-colors disabled:opacity-40 ${
                confirmRegenerate
                  ? "text-accent-yellow hover:text-accent"
                  : "text-muted-foreground hover:text-accent"
              }`}
            >
              {status === "generating"
                ? "Generating\u2026"
                : script
                  ? "Regenerate"
                  : "Generate"}
            </button>
          </div>
        </div>
        <textarea
          value={direction}
          onChange={e => setDirection(e.target.value)}
          placeholder="Optional direction — e.g. &quot;focus on the AI angle&quot;"
          rows={2}
          className="mt-3 w-full bg-transparent border-b border-border px-0 py-2 text-xs tracking-[0.08em] resize-none outline-none focus:border-accent placeholder:text-muted-foreground placeholder:uppercase placeholder:tracking-[0.14em] placeholder:text-[10px]"
        />
      </div>

      {/* Variation tabs */}
      {script && script.variations.length > 0 && (
        <>
          {script.variations.length > 1 && (
            <div className="flex gap-1 mb-2">
              {script.variations.map((v, i) => (
                <button
                  key={i}
                  onClick={() => handleSelectVariation(i)}
                  className={`flex-1 px-3 py-2.5 text-[10px] uppercase tracking-[0.14em] border-2 transition-colors ${
                    i === selectedIndex
                      ? `${STRATEGY_BORDER[v.strategy] ?? "border-border"} bg-card font-bold text-foreground`
                      : "border-border text-muted-foreground hover:text-foreground hover:bg-card"
                  }`}
                >
                  <span className="font-bold block">{v.strategyLabel}</span>
                  <span className="text-muted-foreground block mt-0.5">~{v.totalEstimatedSeconds}s</span>
                </button>
              ))}
            </div>
          )}

          {/* Selected variation */}
          {currentVariation && (
            <div className="border border-border bg-card p-4 mb-2 space-y-3">
              <div className="text-[10px] text-muted-foreground uppercase tracking-[0.14em] font-bold">
                Shape: {currentVariation.storyShape.replace(/_/g, " ")}
              </div>

              {/* Hook */}
              <div className="border-l-2 border-accent-yellow pl-3">
                <p className="text-[10px] font-bold uppercase tracking-[0.14em] mb-1">
                  <span className="text-accent-yellow">Hook</span>
                  <span className="text-muted-foreground ml-2">pattern interrupt</span>
                </p>
                <p className="text-xs tracking-[0.04em] leading-relaxed">
                  &ldquo;{currentVariation.hook}&rdquo;
                </p>
              </div>

              {/* Quotes */}
              {currentVariation.quotes.map((q, i) => (
                <div key={i} className="border-l-2 border-border pl-3">
                  <p className="text-[10px] font-bold uppercase tracking-[0.14em] mb-1">
                    <span className="text-muted-foreground">{q.beat.replace(/_/g, " ")}</span>
                    <span className={`ml-2 ${EMOTION_COLORS[q.emotion] ?? "text-muted-foreground"}`}>
                      {q.emotion}
                    </span>
                  </p>
                  <p className="text-xs tracking-[0.04em] leading-relaxed">
                    &ldquo;{q.text}&rdquo;
                  </p>
                  <p className="text-[10px] text-muted-foreground mt-1 italic tracking-[0.04em]">
                    {q.reason}
                  </p>
                </div>
              ))}

              {/* Open loop */}
              {currentVariation.openLoop && (
                <div className="border-l-2 border-accent-blue pl-3">
                  <p className="text-[10px] font-bold text-accent-blue uppercase tracking-[0.14em] mb-1">
                    Open Loop
                  </p>
                  <p className="text-[10px] text-muted-foreground tracking-[0.04em]">
                    {currentVariation.openLoop}
                  </p>
                </div>
              )}
            </div>
          )}
        </>
      )}

      {/* Step 3 */}
      {script && (
        <div className="border border-border bg-card p-4">
          <div className="flex items-center justify-between gap-3">
            <div className="flex items-center gap-3 flex-1">
              <p className="text-[11px] font-bold uppercase tracking-[0.14em] whitespace-nowrap">
                Step 3 &mdash; Export
              </p>
              <input
                type="text"
                value={sequenceName}
                onChange={e => setSequenceName(e.target.value)}
                placeholder="Sequence name"
                className="flex-1 border-b border-border bg-transparent px-0 py-1 text-xs tracking-[0.08em] outline-none focus:border-accent"
              />
            </div>
            <button
              onClick={handleDownloadXml}
              disabled={busy || !sequence}
              data-slot="bracket-btn"
              className="text-[10px] font-bold uppercase tracking-[0.14em] text-muted-foreground hover:text-accent transition-colors disabled:opacity-40 whitespace-nowrap"
              title={!sequence ? "Upload Premiere XML first" : ""}
            >
              {status === "downloading" ? "Building\u2026" : "Download XML"}
            </button>
          </div>
          {sequence?.files && sequence.files.length > 0 && (
            <div className="flex items-center gap-2 mt-3">
              <label className="text-[10px] text-muted-foreground uppercase tracking-[0.14em] font-bold whitespace-nowrap">
                Audio:
              </label>
              <select
                value={audioFileId}
                onChange={e => setAudioFileId(e.target.value)}
                className="flex-1 border-b border-border bg-transparent px-0 py-1 text-xs tracking-[0.08em] outline-none focus:border-accent"
              >
                <option value="">Source edit audio</option>
                {sequence.files.map(f => (
                  <option key={f.id} value={f.id}>{f.name}</option>
                ))}
              </select>
            </div>
          )}
          {!sequence && (
            <p className="text-[10px] text-accent-yellow font-bold uppercase tracking-[0.14em] mt-2">
              Upload Premiere XML first (Step 1)
            </p>
          )}
        </div>
      )}

      {error && (
        <p className="text-[10px] text-error uppercase tracking-[0.14em] mt-3">{error}</p>
      )}
    </div>
  );
}
