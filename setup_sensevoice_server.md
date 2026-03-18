# SenseVoice Laughter Detection Server — Setup Guide

Set up a Flask HTTP server on the Windows workstation (`DESKTOP-DRF6810`) that detects laughter, applause, and other audio events using FunAudioLLM's SenseVoice model. This server runs alongside the existing WhisperX server.

---

## Machine Details

| Property | Value |
|----------|-------|
| **Tailscale IP** | `100.67.12.59` |
| **Hostname** | `DESKTOP-DRF6810` |
| **GPU** | RTX 4080 (16GB VRAM) |
| **WhisperX server** | Already running on port 9000 |
| **SenseVoice server** | Port **9001** |

---

## Step 1: Install Dependencies

Open a terminal on the Windows machine. Use the same Python environment or create a new one.

```powershell
pip install funasr modelscope torch torchaudio flask
```

If `funasr` is already installed, upgrade it:

```powershell
pip install -U funasr modelscope
```

---

## Step 2: Create the Server Script

Create `C:\sensevoice-server\sensevoice-server.py` with the following contents:

```python
"""
SenseVoice Laughter/Event Detection HTTP Server
Port: 9001
Detects: laughter, applause, crying, coughing, sneezing, BGM
Uses FunAudioLLM/SenseVoiceSmall via FunASR
"""
import os
import re
import tempfile
import time
from flask import Flask, request, jsonify
from funasr import AutoModel
from funasr.utils.postprocess_utils import rich_transcription_postprocess
import torch

app = Flask(__name__)
PORT = int(os.environ.get("PORT", 9001))

device = "cuda:0" if torch.cuda.is_available() else "cpu"
model = None

# Event tags that SenseVoice emits
EVENT_TAGS = ["BGM", "Speech", "Applause", "Laughter", "Cry", "Sneeze", "Breath", "Cough"]
EVENT_PATTERN = re.compile(r"<\|(" + "|".join(EVENT_TAGS) + r")\|>")


def get_model():
    global model
    if model is None:
        print(f"Loading SenseVoice model on {device}...")
        model = AutoModel(
            model="FunAudioLLM/SenseVoiceSmall",
            trust_remote_code=True,
            vad_model="fsmn-vad",
            vad_kwargs={"max_single_segment_time": 30000},
            device=device,
            hub="hf",
        )
        print("SenseVoice model loaded!")
    return model


def extract_events_from_segments(raw_results):
    """
    Parse FunASR output to extract audio events with timestamps.

    FunASR with VAD returns segments with start/end times.
    Each segment's text may contain event tags like <|Laughter|>.
    We extract these and return structured event data.
    """
    events = []
    segments = []

    for result in raw_results:
        text = result.get("text", "")
        # FunASR timestamps: result may contain 'timestamp' key from VAD
        # The key field is the text with embedded event tags

        # Get timing from the result (VAD provides these)
        start_ms = result.get("start", 0)
        end_ms = result.get("end", 0)
        start_sec = start_ms / 1000.0 if start_ms else 0
        end_sec = end_ms / 1000.0 if end_ms else 0

        # Find all event tags in this segment
        found_events = EVENT_PATTERN.findall(text)

        # Clean text (remove event/emotion tags for readable transcript)
        clean_text = rich_transcription_postprocess(text)

        segment_data = {
            "start": round(start_sec, 3),
            "end": round(end_sec, 3),
            "text": clean_text,
            "raw_text": text,
            "events": found_events,
        }
        segments.append(segment_data)

        # Create individual event entries for non-speech events
        for event_type in found_events:
            if event_type == "Speech":
                continue
            events.append({
                "type": event_type.lower(),
                "start": round(start_sec, 3),
                "end": round(end_sec, 3),
                "context_text": clean_text,
            })

    return segments, events


@app.route("/health", methods=["GET"])
def health():
    return jsonify({
        "status": "ok",
        "model": "SenseVoiceSmall",
        "device": device,
        "gpu": torch.cuda.get_device_name(0) if torch.cuda.is_available() else None,
    })


@app.route("/detect", methods=["POST"])
def detect():
    """
    Detect laughter, applause, and other audio events in an audio file.

    Form data:
    - file: Audio file (required)
    - language: Language code hint (optional, default "auto")

    Returns JSON with:
    - events: list of detected non-speech events with timestamps
    - segments: all segments with text, timing, and event tags
    - summary: count of each event type
    """
    if "file" not in request.files:
        return jsonify({"error": "No file provided. Use multipart/form-data with 'file' field."}), 400

    file = request.files["file"]
    language = request.form.get("language", "auto")

    suffix = os.path.splitext(file.filename)[1] or ".wav"
    with tempfile.NamedTemporaryFile(delete=False, suffix=suffix) as tmp:
        file.save(tmp.name)
        tmp_path = tmp.name

    try:
        start_time = time.time()
        m = get_model()

        res = m.generate(
            input=tmp_path,
            cache={},
            language=language,
            use_itn=True,
            batch_size_s=60,
            merge_vad=True,
            merge_length_s=15,
        )

        elapsed = time.time() - start_time

        # res is a list of results; each has "text" and possibly timing info
        # With VAD, results come as a list of segment dicts
        raw_results = res if isinstance(res, list) else [res]

        # Normalize: funasr can return different shapes depending on config
        # Usually it's a list with one item containing all segments
        if len(raw_results) == 1 and isinstance(raw_results[0], dict) and "text" in raw_results[0]:
            # Single result with all text — need to check for sentence_info
            single = raw_results[0]
            if "sentence_info" in single:
                # VAD-segmented output with per-sentence timing
                raw_results = single["sentence_info"]
            else:
                raw_results = [single]

        segments, events = extract_events_from_segments(raw_results)

        # Build summary counts
        summary = {}
        for e in events:
            summary[e["type"]] = summary.get(e["type"], 0) + 1

        return jsonify({
            "events": events,
            "segments": segments,
            "summary": summary,
            "total_events": len(events),
            "total_segments": len(segments),
            "processing_seconds": round(elapsed, 2),
        })

    except Exception as e:
        import traceback
        traceback.print_exc()
        return jsonify({"error": str(e)}), 500
    finally:
        os.unlink(tmp_path)


@app.route("/models", methods=["GET"])
def models():
    return jsonify({
        "loaded": "SenseVoiceSmall" if model else None,
        "device": device,
        "detectable_events": [t.lower() for t in EVENT_TAGS if t != "Speech"],
    })


if __name__ == "__main__":
    print(f"Starting SenseVoice event detection server on port {PORT}...")
    print(f"Device: {device}")
    if torch.cuda.is_available():
        print(f"GPU: {torch.cuda.get_device_name(0)}")
    print(f"Detectable events: {', '.join(t for t in EVENT_TAGS if t != 'Speech')}")
    app.run(host="0.0.0.0", port=PORT, threaded=False)
```

---

## Step 3: Start the Server

```powershell
cd C:\sensevoice-server
python sensevoice-server.py
```

The first run will download the SenseVoiceSmall model (~500MB) and the FSMN-VAD model. Subsequent starts will be faster.

You should see:
```
Starting SenseVoice event detection server on port 9001...
Device: cuda:0
GPU: NVIDIA GeForce RTX 4080
Detectable events: BGM, Applause, Laughter, Cry, Sneeze, Breath, Cough
Loading SenseVoice model on cuda:0...
SenseVoice model loaded!
```

---

## Step 4: Verify It Works

From any machine on the Tailscale network:

```bash
# Health check
curl http://100.67.12.59:9001/health

# Detect events in an audio file
curl -X POST http://100.67.12.59:9001/detect \
  -F "file=@audio.mp3"
```

---

## API Reference

### `GET /health`

Returns server status, model name, device, and GPU info.

### `POST /detect`

Detect audio events in an uploaded file.

**Request (multipart/form-data):**
| Field | Required | Description |
|-------|----------|-------------|
| `file` | Yes | Audio file (mp3, wav, m4a, flac, ogg, webm) |
| `language` | No | Language hint: `auto`, `en`, `zn`, `ja`, `ko`, `yue` (default: `auto`) |

**Response:**
```json
{
  "events": [
    {
      "type": "laughter",
      "start": 42.5,
      "end": 45.2,
      "context_text": "and then he just fell off the chair"
    }
  ],
  "segments": [
    {
      "start": 40.1,
      "end": 45.2,
      "text": "and then he just fell off the chair",
      "raw_text": "<|Speech|><|Laughter|> and then he just fell off the chair",
      "events": ["Speech", "Laughter"]
    }
  ],
  "summary": { "laughter": 1 },
  "total_events": 1,
  "total_segments": 1,
  "processing_seconds": 3.21
}
```

### `GET /models`

Returns loaded model info and list of detectable event types.

---

## Resource Usage

- **VRAM:** SenseVoiceSmall uses ~1-2GB VRAM. Runs comfortably alongside WhisperX (~5-6GB).
- **Speed:** ~70ms per 10 seconds of audio (15x faster than Whisper-Large).
- **Port:** 9001 (does not conflict with WhisperX on 9000).

---

## Troubleshooting

| Issue | Fix |
|-------|-----|
| `ModuleNotFoundError: No module named 'funasr'` | Run `pip install -U funasr modelscope` |
| CUDA out of memory | WhisperX + SenseVoice together need ~7-8GB VRAM. The RTX 4080 has 16GB, so this should be fine. |
| Model download fails | Check internet connection. Models download from HuggingFace on first run. |
| Port 9001 already in use | Change port: `set PORT=9002` then run the script |

---

*Created: March 17, 2026*
