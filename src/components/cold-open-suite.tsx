"use client";

import { useEffect, useState, useRef } from "react";

interface SequenceInfo {
  sequenceName: string;
  timebase: number;
  ntsc: boolean;
  durationFrames: number;
  tracks: { video: number; audio: number };
  clipCount: number;
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
  totalEstimatedSeconds: number;
}

interface ColdOpenScript {
  variations: ColdOpenVariation[];
}

// Legacy single-script format (backward compat)
interface LegacyScript {
  hook: string;
  quotes: Array<{ text: string; reason: string }>;
  totalEstimatedSeconds: number;
}

function isLegacyScript(s: unknown): s is LegacyScript {
  return !!s && typeof s === "object" && "hook" in s && !("variations" in s);
}

const EMOTION_COLORS: Record<string, string> = {
  surprise: "text-amber-400",
  vulnerability: "text-rose-400",
  curiosity: "text-sky-400",
  humor: "text-emerald-400",
  controversy: "text-orange-400",
  conviction: "text-violet-400",
  unknown: "text-muted",
};

const STRATEGY_COLORS: Record<string, string> = {
  hot_take: "border-orange-400",
  vulnerable_moment: "border-rose-400",
  mystery: "border-sky-400",
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
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Load existing sequence + script on mount
  useEffect(() => {
    fetch(`/api/jobs/${jobId}/premiere-xml`)
      .then(r => r.json())
      .then(d => { if (d.sequenceName) setSequence(d); })
      .catch(() => {});

    fetch(`/api/jobs/${jobId}/cold-open`)
      .then(r => r.json())
      .then(d => {
        if (d.script) {
          // Handle both legacy and new format
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
      const res = await fetch(`/api/jobs/${jobId}/cold-open`, { method: "POST" });
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
    // Persist selection server-side
    fetch(`/api/jobs/${jobId}/cold-open/select`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ index }),
    }).catch(() => {}); // non-blocking
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
          sequenceName: `${sequenceName} — ${variation.strategyLabel}`,
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
        <h2 className="text-lg font-semibold">Cold Open</h2>
        {currentVariation && (
          <span className="text-xs text-muted">
            ~{currentVariation.totalEstimatedSeconds}s · {1 + currentVariation.quotes.length} quotes
          </span>
        )}
      </div>

      {/* Step 1 — Upload Premiere XML */}
      <div className="border border-border rounded-lg bg-card p-4 mb-3">
        <div className="flex items-center justify-between">
          <div>
            <p className="text-sm font-medium">
              {sequence ? "Premiere sequence loaded" : "Step 1 — Upload Premiere XML"}
            </p>
            {sequence ? (
              <p className="text-xs text-muted mt-0.5">
                {sequence.sequenceName} · {sequence.timebase}{sequence.ntsc ? "/0.97" : ""} fps ·
                V{sequence.tracks.video} A{sequence.tracks.audio} · {sequence.clipCount} clips
              </p>
            ) : (
              <p className="text-xs text-muted mt-0.5">
                File &rarr; Export &rarr; Final Cut Pro XML from your Premiere edit
              </p>
            )}
          </div>
          <div className="flex items-center gap-2">
            {sequence && (
              <span className="text-xs text-emerald-400">&check; ready</span>
            )}
            <label className={`px-3 py-1.5 text-xs border border-border rounded-lg cursor-pointer transition-colors ${busy ? "opacity-50 pointer-events-none" : "hover:bg-muted/10"}`}>
              {status === "uploading" ? "Uploading\u2026" : sequence ? "Replace" : "Upload XML"}
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

      {/* Step 2 — Generate cold open */}
      <div className="border border-border rounded-lg bg-card p-4 mb-3">
        <div className="flex items-center justify-between">
          <div>
            <p className="text-sm font-medium">Step 2 — Generate cold open scripts</p>
            <p className="text-xs text-muted mt-0.5">
              Creates 3 variations with different emotional strategies
            </p>
          </div>
          <div className="flex items-center gap-2">
            {confirmRegenerate && (
              <span className="text-xs text-amber-400">Replace current? Click again to confirm</span>
            )}
            <button
              onClick={handleGenerateColdOpen}
              disabled={busy}
              className={`px-3 py-1.5 text-xs border rounded-lg transition-colors disabled:opacity-50 ${
                confirmRegenerate
                  ? "border-amber-400 text-amber-400 hover:bg-amber-400/10"
                  : "border-border hover:bg-muted/10"
              }`}
            >
              {status === "generating"
                ? "Generating 3 variations\u2026"
                : script
                  ? "Regenerate"
                  : "Generate"}
            </button>
          </div>
        </div>
      </div>

      {/* Variation tabs + preview */}
      {script && script.variations.length > 0 && (
        <>
          {/* Tab bar */}
          {script.variations.length > 1 && (
            <div className="flex gap-1 mb-3">
              {script.variations.map((v, i) => (
                <button
                  key={i}
                  onClick={() => handleSelectVariation(i)}
                  className={`flex-1 px-3 py-2 text-xs rounded-lg border transition-colors ${
                    i === selectedIndex
                      ? `${STRATEGY_COLORS[v.strategy] ?? "border-border"} bg-card`
                      : "border-transparent text-muted hover:text-foreground hover:bg-card/50"
                  }`}
                >
                  <span className="font-medium">{v.strategyLabel}</span>
                  <span className="block text-muted mt-0.5">~{v.totalEstimatedSeconds}s</span>
                </button>
              ))}
            </div>
          )}

          {/* Selected variation preview */}
          {currentVariation && (
            <div className="border border-border rounded-lg bg-card p-4 mb-3 space-y-3">
              {/* Story shape label */}
              <div className="flex items-center gap-2 text-xs text-muted">
                <span>Story shape: {currentVariation.storyShape.replace(/_/g, " ")}</span>
              </div>

              {/* Hook */}
              <div className="border-l-2 border-amber-400 pl-3">
                <p className="text-xs font-medium mb-1">
                  <span className="text-amber-400">HOOK</span>
                  <span className="text-muted ml-2">pattern interrupt</span>
                </p>
                <p className="text-sm">&ldquo;{currentVariation.hook}&rdquo;</p>
              </div>

              {/* Quotes */}
              {currentVariation.quotes.map((q, i) => (
                <div key={i} className="border-l-2 border-border pl-3">
                  <p className="text-xs font-medium mb-1">
                    <span className="text-muted uppercase">{q.beat.replace(/_/g, " ")}</span>
                    <span className={`ml-2 ${EMOTION_COLORS[q.emotion] ?? "text-muted"}`}>
                      {q.emotion}
                    </span>
                  </p>
                  <p className="text-sm">&ldquo;{q.text}&rdquo;</p>
                  <p className="text-xs text-muted mt-1">{q.reason}</p>
                </div>
              ))}

              {/* Open loop description */}
              {currentVariation.openLoop && (
                <div className="border-l-2 border-sky-400/50 pl-3">
                  <p className="text-xs text-sky-400 font-medium mb-1">OPEN LOOP</p>
                  <p className="text-xs text-muted">{currentVariation.openLoop}</p>
                </div>
              )}
            </div>
          )}
        </>
      )}

      {/* Step 3 — Export XML */}
      {script && (
        <div className="border border-border rounded-lg bg-card p-4">
          <div className="flex items-center justify-between gap-3">
            <div className="flex items-center gap-3 flex-1">
              <p className="text-sm font-medium whitespace-nowrap">Step 3 — Export Premiere XML</p>
              <input
                type="text"
                value={sequenceName}
                onChange={e => setSequenceName(e.target.value)}
                placeholder="Sequence name"
                className="flex-1 px-2 py-1 text-xs bg-transparent border border-border rounded focus:outline-none focus:ring-1 focus:ring-border"
              />
            </div>
            <button
              onClick={handleDownloadXml}
              disabled={busy || !sequence}
              className="px-3 py-1.5 text-xs border border-border rounded-lg hover:bg-muted/10 transition-colors disabled:opacity-50 whitespace-nowrap"
              title={!sequence ? "Upload Premiere XML first" : ""}
            >
              {status === "downloading" ? "Building\u2026" : "Download XML"}
            </button>
          </div>
          {!sequence && (
            <p className="text-xs text-amber-400 mt-2">
              Upload the Premiere XML (Step 1) to enable export
            </p>
          )}
        </div>
      )}

      {error && (
        <p className="text-sm text-red-400 mt-3">{error}</p>
      )}
    </div>
  );
}
