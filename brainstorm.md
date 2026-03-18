# Diggnation Social Clips Pipeline
## Brainstorming, Architecture, and Build Plan

---

## Problem Statement

Given a fully edited, multicam podcast episode (Diggnation), automatically:
1. Transcribe the final edit at word-level precision
2. Detect paralinguistic cues (laughter, applause) to identify high-engagement moments
3. Use AI to recommend and generate 30–60 second social media clips
4. Support **frankensplicing** — cutting different phrases together from across the episode to create a higher-context story
5. Output an importable FCP7 XML (or EDL) that creates a **new sequence** in Adobe Premiere Pro referencing the original source camera files

The editor should be able to import the generated XML and immediately have a new "Social Cuts" sequence with all rough cuts ready for review — without touching the original multicam edit.

---

## Key Constraints & Discoveries

### Multicam XML Export Limitation
- Premiere Pro **cannot export multicam sequences** via FCP7 XML — this is a hard limitation of the FCP7 XML format itself, not a Premiere bug
- The FCP Translation Results log confirms all multicam clip items in `Diggnation Live 01` were skipped on export
- **This does not matter for our use case** — we are *importing* a new generated sequence, not round-tripping the existing one

### The EDL Is the Rosetta Stone
- The exported EDL (`Diggnation_Live_01_edl_test.edl`) contains the full cut map:
  - Every video event maps **program timecode → source filename + source timecode**
  - Camera files identified (examples): `Diggnation Live 01.mp4`, `Diggnation Live CAM 2 01.mp4`, `Diggnation Live CAM 3 01.mp4`, `Diggnation Live CAM 5 01.mp4`, `Diggnation Live 02.mp4`
- Audio events reference multicam nested audio (garbled names like `Diggnation Live 01.mp4Diggnation E28 1`) — these should be bypassed; use a mixed-down audio export for the social clips instead, noting that we DO need to reference audio files to create the new EDL for import.
- EDL format is CMX3600, DROP FRAME, 29.97fps

### FCP7 XML Import Works Fine in Premiere
- Premiere imports FCP7 XML (xmeml) natively via File → Import
- A programmatically generated XML with flat `<clipitem>` elements referencing source files **will import cleanly**
- No multicam structure needed in the generated output — each frankensplice segment is just a flat clip pointing at the correct source file + source timecode

---

## Data Flow Architecture

```
┌─────────────────────────────────┐
│     Final edited audio mix      │  ← Export from Premiere (stereo mixdown, .mp3)
│     (single stereo .mp3, or any audio format)        │
└────────────────┬────────────────┘
                 │
        ┌────────┴────────┐
        │                 │
        ▼                 ▼
  ┌──────────┐    ┌─────────────────┐
  │ WhisperX │    │   SenseVoice    │
  │          │    │                 │
  │ Word-level│   │ Laughter /      │
  │ timestamps│   │ applause /      │
  │ + speaker │   │ event detection │
  │ diarization│  │ + timestamps    │
  └─────┬────┘    └────────┬────────┘
        │                  │
        └────────┬─────────┘
                 │
                 ▼
      ┌──────────────────────┐
      │   Timestamp Fusion   │
      │                      │
      │ Align laughter events│
      │ to word-level        │
      │ transcript windows   │
      └──────────┬───────────┘
                 │
                 ▼
      ┌──────────────────────┐
      │  EDL Interval Tree   │
      │                      │
      │ program TC →         │
      │ source file +        │
      │ source TC lookup     │
      └──────────┬───────────┘
                 │
                 ▼
      ┌──────────────────────┐
      │  LLM Context Engine  │
      │                      │
      │ For each laughter    │
      │ event: extract ±30s  │
      │ transcript window,   │
      │ explain why they     │
      │ laughed, score       │
      │ shareability         │
      └──────────┬───────────┘
                 │
                 ▼
      ┌──────────────────────┐
      │  Clip Recommender    │
      │                      │
      │ Score by: intensity, │
      │ duration, LLM rating │
      │ Generate frankensplice│
      │ candidates           │
      └──────────┬───────────┘
                 │
                 ▼
      ┌──────────────────────┐
      │  FCP7 XML Generator  │
      │                      │
      │ One <clipitem> per   │
      │ segment, referencing │
      │ source camera files  │
      │ + mixed audio track  │
      └──────────┬───────────┘
                 │
                 ▼
      ┌──────────────────────┐
      │  Premiere Pro Import │
      │                      │
      │ File → Import →      │
      │ social_cuts.xml      │
      │ New "Social Cuts"    │
      │ sequence appears     │
      └──────────────────────┘
```

---

## Module Breakdown

### Module 1: EDL Parser

**Input:** `Diggnation_Live_01_edl_test.edl`

**Output:** An interval tree (or sorted list) queryable by program timecode, returning:
```python
{
  "source_file": "Diggnation Live CAM 5 01.mp4",
  "source_tc_in": "12:46:54:12",   # source timecode at that program TC
  "source_tc_offset": 42,           # frames into source clip
  "event_number": 4
}
```

**Key parsing rules:**
- Format: CMX3600 EDL
- Lines starting with a 3-digit number are events
- Column layout: `EVENT# REEL CHANNEL CUT SRC_IN SRC_OUT REC_IN REC_OUT`
- `* FROM CLIP NAME:` comment on the next line gives the actual filename
- `AA` channel = audio, `V` = video, `NONE` = disabled audio, `BL` = black/slug
- Parse only `V` events for the video cut map
- Timecode format: `HH:MM:SS:FF` drop frame (semicolons = drop frame)
- Build an interval tree over record (program) timecode ranges

**Libraries:** `intervaltree`, standard `re`

---

### Module 2: Audio Export + WhisperX Transcription

**Input:** Final edited sequence audio (export from Premiere as stereo .wav before running pipeline)

**WhisperX setup:**
```bash
pip install whisperx
```

**Run:**
```python
import whisperx

model = whisperx.load_model("large-v2", device="cuda", compute_type="float16")
audio = whisperx.load_audio("diggnation_ep28_mix.wav")
result = model.transcribe(audio, batch_size=16)

# Align for word-level timestamps
model_a, metadata = whisperx.load_align_model(language_code=result["language"], device="cuda")
result = whisperx.align(result["segments"], model_a, metadata, audio, device="cuda")

# Speaker diarization (optional but useful for frankensplicing)
diarize_model = whisperx.DiarizationPipeline(use_auth_token=HF_TOKEN, device="cuda")
diarize_segments = diarize_model(audio)
result = whisperx.assign_word_speakers(diarize_segments, result)
```

**Output schema per word:**
```json
{
  "word": "incredible",
  "start": 2521.34,
  "end": 2521.89,
  "score": 0.98,
  "speaker": "SPEAKER_00"
}
```

**Note:** `start`/`end` are in **seconds from the start of the mixed audio file**, which corresponds to **program timecode** (assuming mix starts at 00:00:00:00). Convert to frames: `frame = seconds * 29.97` (round to nearest, accounting for drop frame).

---

### Module 3: SenseVoice Laughter Detection

**Repo:** https://github.com/FunAudioLLM/SenseVoice

**Why SenseVoice over dedicated laughter models:**
- Detects laughter, applause, crying, coughing, BGM inline with transcription
- 15x faster than Whisper-Large
- Outputs event labels: `<|Laughter|>`, `<|Applause|>`, `<|BGM|>`, `<|Speech|>`
- Includes timestamp support via CTC alignment (added Nov 2024)

**Alternative/supplement:** `omine-me/LaughterSegmentation` (Interspeech 2024) — dedicated model, outputs JSON with precise laughter segment timestamps, useful for cross-validation

**Install:**
```bash
pip install funasr
pip install -U funasr modelscope
```

**Run:**
```python
from funasr import AutoModel

model = AutoModel(
    model="iic/SenseVoiceSmall",
    trust_remote_code=True,
    device="cuda"
)

res = model.generate(
    input="diggnation_ep28_mix.wav",
    cache={},
    language="auto",
    use_itn=True,
    batch_size_s=60,
)
# Parse res for <|Laughter|> tags and their timestamps
```

**Output:** List of laughter events with start/end seconds

---

### Module 4: Timestamp Fusion

**Goal:** For each laughter event (from SenseVoice), find the surrounding words (from WhisperX) and build a context window.

**Logic:**
- For each laughter event at `[laugh_start, laugh_end]`, find all WhisperX words where `word.start >= laugh_start - 30` and `word.end <= laugh_end + 30`
- Trim to sentence boundaries (look for words after terminal punctuation)
- Tag the laughter position within the word sequence

**Output per event:**
```json
{
  "laugh_start_sec": 2518.2,
  "laugh_end_sec": 2521.1,
  "laugh_duration_sec": 2.9,
  "context_words": [...],
  "context_text": "...the full sentence context...",
  "program_tc_in": "00:41:58:06",
  "program_tc_out": "00:42:01:03"
}
```

---

### Module 5: LLM Context Analysis

**For each laughter event**, send the context window to Claude (or GPT-4o) to:
1. Explain why the laugh happened
2. Score shareability (1–10) for different platforms (TikTok, Instagram Reels, YouTube Shorts)
3. Identify if it's a standalone moment or needs frankensplicing for context
4. Suggest an optimal clip boundary (in/out words by index)
5. Suggest a short caption/hook

**Prompt template:**
```
You are a podcast clip editor for Diggnation, a tech/culture show hosted by Kevin Rose and Alex Ohanian.

The following is a transcript excerpt where laughter occurred. The laugh happened between the markers [LAUGH_START] and [LAUGH_END].

Transcript:
{context_text}

Please provide:
1. Why they laughed (1-2 sentences)
2. Shareability score out of 10 for short-form social (with brief reason)
3. Recommended clip start word index and end word index for a 30-60 second clip
4. Whether frankensplicing is needed to give the moment enough context
5. A suggested caption/hook (under 100 characters)

Respond as JSON.
```

---

### Module 6: Frankensplice Candidate Builder

**For moments that need frankensplicing:**
- LLM identifies that context from an earlier part of the episode is needed
- System retrieves that earlier context from the WhisperX transcript
- Builds a `clip_plan`: ordered list of `{word_start, word_end}` ranges from anywhere in the episode
- Each range gets resolved through the EDL interval tree to `{source_file, source_tc_in, source_tc_out}`

**Frankensplice rules:**
- Minimum segment duration: 1 second (to avoid jarring micro-cuts)
- Audio must remain continuous from the mixed audio export (no frankensplice on audio — only video cuts change)
- Or alternatively: allow audio frankensplicing with a short crossfade (handled in Premiere after import)

---

### Module 7: FCP7 XML Generator

**Output format:** FCP7 XML (xmeml version 4) — natively importable into Premiere Pro via File → Import

**Key XML structure:**
```xml
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE xmeml>
<xmeml version="4">
  <sequence>
    <name>Social Cut 01 - Laughter at 42min</name>
    <duration>{total_frames}</duration>
    <rate>
      <timebase>30</timebase>
      <ntsc>TRUE</ntsc>
    </rate>
    <media>
      <video>
        <track>
          <clipitem id="clipitem-1">
            <name>Diggnation Live CAM 5 01.mp4</name>
            <duration>{clip_duration_frames}</duration>
            <rate><timebase>30</timebase><ntsc>TRUE</ntsc></rate>
            <start>{program_start_frame}</start>
            <end>{program_end_frame}</end>
            <in>{source_in_frame}</in>
            <out>{source_out_frame}</out>
            <file id="file-1">
              <name>Diggnation Live CAM 5 01.mp4</name>
              <pathurl>file://localhost/path/to/Diggnation Live CAM 5 01.mp4</pathurl>
              <rate><timebase>30</timebase><ntsc>TRUE</ntsc></rate>
              <timecode>
                <rate><timebase>30</timebase><ntsc>TRUE</ntsc></rate>
                <string>{file_start_tc}</string>
                <frame>{file_start_frame}</frame>
                <displayformat>DF</displayformat>
              </timecode>
            </file>
          </clipitem>
          <!-- additional clipitems for frankensplice segments -->
        </track>
      </video>
      <audio>
        <track>
          <!-- Single audio clipitem referencing the mixed .wav -->
          <clipitem id="audio-1">
            <name>diggnation_ep28_mix.wav</name>
            <start>0</start>
            <end>{total_frames}</end>
            <in>{audio_in_frame}</in>
            <out>{audio_out_frame}</out>
            <file id="audio-file-1">
              <name>diggnation_ep28_mix.wav</name>
              <pathurl>file://localhost/path/to/diggnation_ep28_mix.wav</pathurl>
            </file>
          </clipitem>
        </track>
      </audio>
    </media>
  </sequence>
</xmeml>
```

**Important notes on frame math:**
- Drop frame 29.97: use the standard DF conversion formula, not simple multiplication
- `<in>` and `<out>` are **source** frame offsets from the start of the source file
- `<start>` and `<end>` are **program** frame positions in the new sequence
- File timecodes (e.g., `12:46:54:12`) must be converted to absolute frame numbers
- All file references must use `file://localhost/` prefix (absolute local paths)
- Each unique source file gets one `<file>` element with full metadata; subsequent references use `<file id="file-1"/>` (empty, ID-only reference)

**Separate XML per social clip**, or optionally a single XML with multiple `<sequence>` elements (one per clip), which Premiere imports as separate sequences in a bin.

---

### Module 8: Pipeline Orchestration

**Suggested project structure:**
```
diggnation-clips/
├── pipeline/
│   ├── edl_parser.py          # Module 1
│   ├── transcribe.py          # Module 2 (WhisperX)
│   ├── laughter_detect.py     # Module 3 (SenseVoice)
│   ├── fusion.py              # Module 4
│   ├── llm_analysis.py        # Module 5
│   ├── frankensplice.py       # Module 6
│   ├── xml_generator.py       # Module 7
│   └── run_pipeline.py        # Orchestrator
├── data/
│   ├── edl/                   # Input EDLs
│   ├── audio/                 # Mixed audio exports
│   ├── transcripts/           # WhisperX JSON output
│   ├── laughter/              # SenseVoice output
│   ├── recommendations/       # LLM output JSON
│   └── xml_output/            # Generated FCP7 XML files
├── config.yaml                # Paths, model settings, thresholds
└── README.md
```

**CLI invocation:**
```bash
python run_pipeline.py \
  --edl data/edl/Diggnation_Live_01.edl \
  --audio data/audio/ep28_mix.wav \
  --media-dir /Volumes/Media/Diggnation/ \
  --output data/xml_output/ \
  --max-clips 10 \
  --min-laugh-duration 1.5 \
  --clip-target-duration 45
```

---

## Source Files Reference

From the EDL, the known source camera files for Diggnation Episode 28:

| File | Camera | Notes |
|------|--------|-------|
| `Diggnation Live 01.mp4` | Main cam (CAM 1?) | Majority of the edit, ~1hr+ |
| `Diggnation Live CAM 2 01.mp4` | CAM 2 | Used at 19:36 and 41:59 |
| `Diggnation Live CAM 3 01.mp4` | CAM 3 | Used at 18:57 |
| `Diggnation Live CAM 5 01.mp4` | CAM 5 | Multiple cuts throughout |
| `Diggnation Live 02.mp4` | Part 2 main | Second hour of episode |

All files share reel ID `AX` in the EDL. Source timecodes range from ~12:46 to ~13:57 (wall clock / jam sync timecode).

---

## Timecode Utilities Needed

```python
import math

FRAMERATE = 29.97
TIMEBASE = 30  # nominal

def tc_to_frames_df(tc_string):
    """Convert drop-frame timecode HH;MM;SS;FF to absolute frame number."""
    # semicolons = drop frame
    tc_string = tc_string.replace(';', ':')
    h, m, s, f = map(int, tc_string.split(':'))
    # CMX drop-frame formula
    total_minutes = 60 * h + m
    drop_frames = 2 * (total_minutes - total_minutes // 10)
    frame_number = (TIMEBASE * 3600 * h +
                    TIMEBASE * 60 * m +
                    TIMEBASE * s + f - drop_frames)
    return frame_number

def frames_to_tc_df(frames):
    """Convert absolute frame number back to drop-frame timecode string."""
    drop_frames = 2
    frames_per_10min = 17982
    frames_per_min = 1798
    d, m = divmod(frames, frames_per_10min)
    if m > drop_frames:
        m_adj = (m - drop_frames) // frames_per_min
    else:
        m_adj = 0
    frames_adj = frames + drop_frames * (9 * d + m_adj)
    ff = frames_adj % TIMEBASE
    ss = (frames_adj // TIMEBASE) % 60
    mm = (frames_adj // (TIMEBASE * 60)) % 60
    hh = frames_adj // (TIMEBASE * 3600)
    return f"{hh:02d};{mm:02d};{ss:02d};{ff:02d}"

def seconds_to_frames(seconds):
    """Convert seconds (from WhisperX) to frame number at 29.97."""
    return round(seconds * FRAMERATE)
```

---

## Open Questions for Build

1. **Media file paths** — the pipeline needs to know the absolute paths to the source `.mp4` files on disk. Will these always be on the same drive? Consider a `config.yaml` with a `media_root` that gets prepended to all filenames from the EDL.

2. **Audio frankensplicing** — decision needed: does the mixed audio follow the frankensplice cuts (meaning audio also jumps), or does it stay continuous? If audio jumps, it needs its own `<clipitem>` chain. If continuous, a single audio clip with the mixed export is simpler and cleaner for social.

3. **Multi-episode support** — the EDL naming (`E28`) suggests this will run on many episodes. The orchestrator should be episode-agnostic from the start.

4. **LLM model choice** — Claude Sonnet 4.6 (`claude-sonnet-4-6`) recommended for the context analysis step. Consider batching laughter events into a single prompt per episode to reduce API calls and give the model full episode context.

5. **Frankensplice validation** — before generating XML, validate that all frankensplice segments are at least N frames long and that total clip duration is within target range (30–60 seconds). Reject/re-prompt if not.

6. **File ID deduplication** — in the generated XML, each unique source file needs exactly one full `<file>` element; all other references must use the short `<file id="..."/>` form. Track which file IDs have been emitted.

7. **Premiere media relinking** — if Premiere can't find the files at the embedded path on import, it will prompt for relinking. Confirm media root path before generating XML, or add a note to the README about expected drive structure.

---

## Key Libraries

```
whisperx          # word-level transcription + diarization
funasr            # SenseVoice laughter detection
intervaltree      # EDL program-TC → source-TC lookup
anthropic         # LLM context analysis (claude-sonnet-4-6)
lxml              # FCP7 XML generation
click             # CLI
pyyaml            # config
```

---

## References

- FCP7 XML spec: https://developer.apple.com/library/archive/documentation/AppleApplications/Reference/FinalCutPro_XML/Elements/Elements.html
- WhisperX: https://github.com/m-bain/whisperX
- SenseVoice: https://github.com/FunAudioLLM/SenseVoice
- LaughterSegmentation (backup): https://github.com/omine-me/LaughterSegmentation
- Demystifying FCP XML: https://fcp.cafe/developer-cases/fcpxml/
- Adobe Premiere FCP XML import: https://helpx.adobe.com/premiere-pro/using/importing-xml-project-files-final.html
