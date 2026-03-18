# Project Status — March 17, 2026

## What's Working

- **Web app** (Next.js) — upload audio, queue jobs, view transcripts
- **WhisperX transcription** — word-level timestamps, running on remote GPU (RTX 4080) via Tailscale at `100.67.12.59:9000`
- **SenseVoice server** — installed and running at `100.67.12.59:9001`, detects laughter/applause/events
- **Live job logs** — SSE-based real-time log streaming on job detail pages
- **Model selector** — dropdown on upload page (tiny/base/small/medium/large-v2/large-v3), default small
- **Auto-redirect** — upload page navigates to job page immediately after upload
- **Dynamic model loading** — WhisperX server swaps models on demand per request

## What's Broken

### 1. Speaker Diarization (BLOCKING)

WhisperX's `DiarizationPipeline` internally tries to load `pyannote/speaker-diarization-community-1`, which is a gated model Mau hasn't accepted access for. The error:

```
403 Client Error: Cannot access gated repo for url .../pyannote/speaker-diarization-community-1/...
```

**Root cause:** The installed version of `whisperx` on the Windows machine has `speaker-diarization-community-1` hardcoded internally, even though the server script specifies `speaker-diarization-3.1`.

**Fix:** Update whisperx on the Windows machine:

```powershell
pip install -U whisperx
```

Then restart the WhisperX server. A newer version should use `speaker-diarization-3.1` (already accepted on HuggingFace under user `maubrowncow`).

**If upgrading whisperx doesn't fix it**, the alternative is to bypass `whisperx.assign_word_speakers()` entirely and assign speakers manually from the pyannote DataFrame — but try the upgrade first.

### 2. SenseVoice Keeps Going Down

SenseVoice server at port 9001 has gone unresponsive multiple times during this session. Possible memory issue or the model gets stuck. The worker gracefully skips event detection when SenseVoice is unreachable, but this means transcripts won't have laughter markers.

**Potential fix:** Add a watchdog/auto-restart script, or run it as a Windows service.

## Pipeline Flow (When Everything Works)

```
Upload MP3 → WhisperX (transcription + alignment + diarization)
           → SenseVoice (laughter/event detection)
           → Timestamp Fusion (merge events into transcript segments)
           → Enriched JSON saved with:
               - Word-level timestamps
               - Speaker labels (SPEAKER_00, SPEAKER_01)
               - Event markers (laughter, applause, etc.)
```

## Server Details

| Service | Port | URL | Notes |
|---------|------|-----|-------|
| WhisperX | 9000 | `http://100.67.12.59:9000` | Dynamic model loading, diarization available |
| SenseVoice | 9001 | `http://100.67.12.59:9001` | Laughter/event detection, tends to go down |
| Next.js App | 3000 | `http://localhost:3000` | Run with `npm run dev` |

## Environment Variables (.env)

```
WHISPERX_URL=http://100.67.12.59:9000
SENSEVOICE_URL=http://100.67.12.59:9001
HF_TOKEN=<your-huggingface-token>
DATABASE_PATH=data/app.db
UPLOAD_DIR=data/uploads
TRANSCRIPT_DIR=data/transcripts
POLL_INTERVAL_MS=5000
```

## HuggingFace Access (user: maubrowncow)

Accepted licenses for:
- `pyannote/speaker-diarization-3.1`
- `pyannote/segmentation-3.0`

NOT accepted (and shouldn't need to be):
- `pyannote/speaker-diarization-community-1` — this is what the old whisperx version tries to load

## Next Steps After Diarization Is Fixed

1. Verify full pipeline produces enriched JSON with speakers + laughter events
2. Build the transcript viewer to display speaker labels and highlight laughter moments
3. Move on to brainstorm.md modules 5-7: LLM context analysis, frankensplicing, FCP7 XML generation

## Key Files

- `whisperX.py` — Flask server script for WhisperX (reference copy, deployed to Windows at `C:\whisper-server\`)
- `setup_sensevoice_server.md` — Setup guide for SenseVoice server
- `src/lib/worker.ts` — Background job processor (orchestrates the full pipeline)
- `src/lib/whisperx-client.ts` — WhisperX HTTP client
- `src/lib/sensevoice-client.ts` — SenseVoice HTTP client
- `src/lib/job-logger.ts` — Job logging utility
- `brainstorm.md` — Full pipeline architecture and module breakdown
