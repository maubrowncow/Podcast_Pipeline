# Diggnation Podcast Pipeline Web App — Brainstorm

**Date:** 2026-03-17
**Status:** Ready for planning

---

## What We're Building

A web app for the Diggnation podcast pipeline that provides a unified interface — accessible from anywhere via Tailscale — for transcribing audio files and (in later phases) generating EDLs, social media clips, show notes, newsletters, and other content.

### Phased Rollout

1. **Phase 1 — Transcription**: Drag-and-drop audio upload, job queue, word-level transcription with speaker diarization via WhisperX, transcript viewer with JSON export
2. **Phase 2 — EDL Generation**: Parse CMX3600 EDLs, build interval trees, map transcription timestamps to source timecodes
3. **Phase 3 — Content Generation**: Title recommendations, show notes, social media posts, newsletter drafts, social clip recommendations (leveraging the full pipeline from brainstorm.md)

---

## Why This Approach

### Architecture: Next.js Monorepo

A single Next.js application running on the same Windows workstation as WhisperX (RTX 4080, accessible via Tailscale at `100.67.12.59`).

**Why monorepo:** Simplest to start — one codebase, one deploy. API routes handle CRUD and file uploads. A background worker (interval-based or lightweight queue) processes transcription jobs by calling the WhisperX Flask server on localhost:9000.

**Why Next.js over Python frontend:** The user prefers React/Next.js for the component architecture needed to scale through all three phases. Python ML services (WhisperX, SenseVoice) remain as separate Flask/FastAPI services called over HTTP on localhost.

**Why not FastAPI backend:** Keeps the codebase unified in TypeScript. WhisperX already has a working Flask server (`whisperX.py`) — the Next.js API routes simply call it.

### Data: SQLite

- **Why SQLite:** Single-user tool, zero-config, file-based, survives server restarts. Stores job queue, transcripts, and metadata.
- **ORM:** Prisma or Drizzle (to be decided in planning)

### Job Processing: Queue-Based

- Users can upload multiple files and see a list of jobs with status
- Click into completed jobs to view transcript with word-level timestamps
- Background worker polls SQLite for pending jobs, sends files to WhisperX, stores results
- Diarization (speaker identification) enabled by default

---

## Key Decisions

1. **Hosting**: Same Windows workstation as WhisperX (RTX 4080) — no network hops between web app and transcription service
2. **Frontend**: React / Next.js with TypeScript
3. **Backend**: Next.js API routes (not a separate backend service)
4. **Architecture**: Single monorepo — one Next.js project handles frontend, API, and background job processing
5. **Database**: SQLite for job queue, transcripts, metadata
6. **Job UX**: Queue-based with job list (not upload-and-wait)
7. **Transcription output**: View in-app with word-level timestamps + download as JSON
8. **Speaker diarization**: Included in Phase 1 (requires one-time HuggingFace token for pyannote model download, then fully local on RTX 4080)
9. **WhisperX integration**: Call existing Flask server on localhost:9000 (already built in `whisperX.py`)

---

## Open Questions (for Planning)

1. **ORM choice**: Prisma vs Drizzle for SQLite access
2. **Background job pattern**: `setInterval` polling vs a lightweight queue library (e.g., better-queue, bull with SQLite adapter)
3. **File storage**: Where to store uploaded audio files and transcription results on disk
4. **WhisperX model selection**: Should the UI allow choosing model size (base/medium/large-v3) per job, or default to large-v3?
5. **Authentication**: Any auth needed, or is Tailscale network-level access sufficient?
6. **HuggingFace token management**: How to configure/store the token for diarization model download
7. **Supported audio formats**: mp3, wav, m4a, flac, ogg, webm (per WhisperX docs) — validate on upload?

---

## Phase 1 Scope (Transcription MVP)

### In Scope
- Drag-and-drop file upload (single or multiple files)
- Job queue with status tracking (pending, processing, completed, failed)
- Job list dashboard showing all jobs
- WhisperX transcription with word-level timestamps
- Speaker diarization via pyannote
- Transcript viewer with word-level detail
- JSON export of transcription results
- Health check / status of WhisperX service

### Out of Scope (Phase 2+)
- EDL parsing and timecode mapping
- SenseVoice laughter detection
- LLM-powered clip recommendations
- FCP7 XML generation
- Social media post generation
- Show notes / newsletter generation
- Title recommendations
- Frankensplicing

---

## Technical Context

### Existing Infrastructure
- **WhisperX Flask server** (`whisperX.py`): Running on port 9000, accepts multipart file upload, returns JSON with segments, word-level timestamps, language, duration
- **GPU**: RTX 4080 (16GB VRAM) — large-v3 model uses ~5-6GB VRAM
- **Tailscale IP**: `100.67.12.59` (hostname: `DESKTOP-DRF6810`)
- **Other services on the machine**: Piper TTS (3456), Qwen3 TTS (3457), Llama Server (8888)

### WhisperX Response Schema (from existing server)
```json
{
  "text": "full transcription text",
  "segments": [
    {
      "start": 0.0,
      "end": 2.5,
      "text": "segment text",
      "words": [
        {"word": "hello", "start": 0.0, "end": 0.3, "score": 0.95}
      ]
    }
  ],
  "language": "en",
  "duration": 3600.0,
  "processing_time": 120.0,
  "realtime_factor": 0.033
}
```

---

## References
- Existing brainstorm: `brainstorm.md` (full pipeline architecture)
- WhisperX server: `whisperX.py`
- Access docs: `accessing_transcriber.md`
