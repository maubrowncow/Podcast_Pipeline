"use client";

import { useEffect, useState, useCallback, useRef } from "react";

function msToTimecode(ms: number): string {
  const totalSeconds = Math.floor(ms / 1000);
  const h = Math.floor(totalSeconds / 3600);
  const m = Math.floor((totalSeconds % 3600) / 60);
  const s = totalSeconds % 60;
  const msRem = ms % 1000;
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}.${String(msRem).padStart(3, "0")}`;
}

interface Segment {
  id: number;
  jobId: number;
  speaker: string | null;
  startMs: number;
  endMs: number;
  text: string;
  segmentIndex: number;
}

const SPEAKER_COLORS = [
  "text-accent-blue",
  "text-accent-green",
  "text-accent-yellow",
  "text-accent-red",
  "text-cold-grey",
  "text-muted-foreground",
];

function speakerColor(speaker: string | null, index: Map<string, number>): string {
  if (!speaker) return "text-muted-foreground";
  const i = index.get(speaker) ?? 0;
  return SPEAKER_COLORS[i % SPEAKER_COLORS.length];
}

export function EditSuite({ jobId }: { jobId: number }) {
  const [segments, setSegments] = useState<Segment[]>([]);
  const [loading, setLoading] = useState(true);
  const [condensing, setCondensing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [debouncedQuery, setDebouncedQuery] = useState("");
  const [page, setPage] = useState(1);
  const [hasMore, setHasMore] = useState(false);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const LIMIT = 50;

  const speakerIndex = new Map<string, number>();
  let speakerCount = 0;
  for (const seg of segments) {
    if (seg.speaker && !speakerIndex.has(seg.speaker)) {
      speakerIndex.set(seg.speaker, speakerCount++);
    }
  }

  const fetchSegments = useCallback(
    async (q: string, p: number) => {
      setLoading(true);
      setError(null);
      try {
        const params = new URLSearchParams({ page: String(p), limit: String(LIMIT) });
        if (q) params.set("q", q);
        const res = await fetch(`/api/jobs/${jobId}/segments?${params}`);
        if (!res.ok) {
          const body = await res.json().catch(() => ({}));
          setError(body.error ?? "Failed to load segments");
          return;
        }
        const data = await res.json();
        setSegments(data.segments ?? []);
        setHasMore((data.segments?.length ?? 0) === LIMIT);
      } catch {
        setError("Failed to load segments");
      } finally {
        setLoading(false);
      }
    },
    [jobId]
  );

  useEffect(() => {
    async function init() {
      const params = new URLSearchParams({ page: "1", limit: "1" });
      const res = await fetch(`/api/jobs/${jobId}/segments?${params}`);
      if (!res.ok) { setLoading(false); return; }
      const data = await res.json();
      if ((data.segments?.length ?? 0) === 0) {
        setCondensing(true);
        try {
          await fetch(`/api/jobs/${jobId}/condense`, { method: "POST" });
        } catch { /* non-fatal */ }
        setCondensing(false);
      }
      fetchSegments("", 1);
    }
    init();
  }, [jobId, fetchSegments]);

  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => {
      setDebouncedQuery(query);
      setPage(1);
    }, 300);
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, [query]);

  useEffect(() => {
    fetchSegments(debouncedQuery, page);
  }, [debouncedQuery, page, fetchSegments]);

  async function handleCondense() {
    setCondensing(true);
    setError(null);
    try {
      const res = await fetch(`/api/jobs/${jobId}/condense`, { method: "POST" });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error ?? "Condensation failed");
        return;
      }
      await fetchSegments(debouncedQuery, 1);
    } catch {
      setError("Condensation failed");
    } finally {
      setCondensing(false);
    }
  }

  const isEmpty = !loading && segments.length === 0 && !debouncedQuery;

  return (
    <div>
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-3">
          <h2 className="text-xs font-bold uppercase tracking-[0.14em] flex items-center gap-2">
            <span className="inline-block w-2 h-2 bg-accent-blue" />
            Edit Suite
          </h2>
          {segments.length > 0 && !debouncedQuery && (
            <span className="text-[10px] text-muted-foreground uppercase tracking-[0.14em]">
              {segments.length} segments
            </span>
          )}
          {debouncedQuery && (
            <span className="text-[10px] text-muted-foreground uppercase tracking-[0.14em]">
              {segments.length} results
            </span>
          )}
        </div>
        <div className="flex items-center gap-2">
          {(condensing || (loading && segments.length === 0)) ? (
            <span className="text-[10px] text-muted-foreground uppercase tracking-[0.14em]">
              Indexing...
            </span>
          ) : segments.length > 0 ? (
            <>
              <a
                href={`/api/jobs/${jobId}/segments?format=text`}
                data-slot="bracket-btn"
                className="text-[10px] font-bold uppercase tracking-[0.14em] text-muted-foreground hover:text-accent transition-colors"
                title="Download condensed text"
              >
                TXT
              </a>
              <a
                href={`/api/jobs/${jobId}/edl?format=edl`}
                data-slot="bracket-btn"
                className="text-[10px] font-bold uppercase tracking-[0.14em] text-muted-foreground hover:text-accent transition-colors"
                title="Download CMX3600 EDL"
              >
                EDL
              </a>
              <a
                href={`/api/jobs/${jobId}/edl`}
                data-slot="bracket-btn"
                className="text-[10px] font-bold uppercase tracking-[0.14em] text-muted-foreground hover:text-accent transition-colors"
                title="Download FCP7 XML"
              >
                XML
              </a>
            </>
          ) : null}
        </div>
      </div>

      {/* Search */}
      <div className="mb-3">
        <input
          type="text"
          placeholder="Search transcript..."
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          className="w-full border-b border-border bg-transparent px-0 py-2 text-xs tracking-[0.08em] outline-none focus:border-accent placeholder:text-muted-foreground placeholder:uppercase placeholder:tracking-[0.14em] placeholder:text-[10px]"
        />
      </div>

      {error && (
        <p className="text-[10px] text-error uppercase tracking-[0.14em] mb-3">{error}</p>
      )}

      {isEmpty && (
        <div className="border border-border bg-card p-8 text-center">
          <p className="text-[10px] text-muted-foreground uppercase tracking-[0.14em] mb-3">
            No segments indexed yet
          </p>
          <button
            onClick={handleCondense}
            disabled={condensing}
            data-slot="bracket-btn"
            className="text-[11px] font-bold uppercase tracking-[0.14em] text-foreground hover:text-accent transition-colors disabled:opacity-40"
          >
            {condensing ? "Condensing..." : "Build Index"}
          </button>
        </div>
      )}

      {!isEmpty && (
        <div className="border border-border bg-card divide-y divide-border">
          {loading ? (
            <p className="text-[10px] text-muted-foreground uppercase tracking-[0.14em] p-4">
              Loading...
            </p>
          ) : segments.length === 0 ? (
            <p className="text-[10px] text-muted-foreground uppercase tracking-[0.14em] p-4">
              No matches
            </p>
          ) : (
            segments.map((seg) => (
              <div
                key={seg.id}
                className="px-4 py-2.5 flex gap-4 items-start hover:bg-secondary/30 transition-colors"
              >
                <div className="flex-shrink-0 w-28 text-[10px] text-muted-foreground tabular-nums pt-0.5 tracking-[0.08em]">
                  {msToTimecode(seg.startMs)}
                </div>
                <div className="flex-shrink-0 w-24 text-[10px] font-bold uppercase tracking-[0.14em] truncate pt-0.5">
                  <span className={speakerColor(seg.speaker, speakerIndex)}>
                    {seg.speaker ?? "\u2014"}
                  </span>
                </div>
                <div className="flex-1 text-xs leading-relaxed tracking-[0.04em]">
                  {seg.text}
                </div>
              </div>
            ))
          )}
        </div>
      )}

      {/* Pagination */}
      {(page > 1 || hasMore) && !debouncedQuery && (
        <div className="flex items-center gap-4 mt-3 justify-center">
          <button
            onClick={() => setPage((p) => Math.max(1, p - 1))}
            disabled={page === 1}
            data-slot="bracket-btn"
            className="text-[10px] font-bold uppercase tracking-[0.14em] text-muted-foreground hover:text-accent disabled:opacity-40 transition-colors"
          >
            Prev
          </button>
          <span className="text-[10px] text-muted-foreground uppercase tracking-[0.14em]">
            Page {page}
          </span>
          <button
            onClick={() => setPage((p) => p + 1)}
            disabled={!hasMore}
            data-slot="bracket-btn"
            className="text-[10px] font-bold uppercase tracking-[0.14em] text-muted-foreground hover:text-accent disabled:opacity-40 transition-colors"
          >
            Next
          </button>
        </div>
      )}
    </div>
  );
}
