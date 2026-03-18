# Transcription Services - Local Access Guide

This document describes how to access transcription services running on Mau's Windows workstation via Tailscale.

## Network Access

| Property | Value |
|----------|-------|
| **Tailscale IP** | `100.67.12.59` |
| **Hostname** | `DESKTOP-DRF6810` |
| **OS** | Windows 10/11 |
| **GPU** | RTX 4080 (16GB VRAM) |

---

## Available Transcription Services

### 1. WhisperX (GPU-Accelerated)

**Package:** `whisperx` v3.8.1  
**Backend:** `faster-whisper` v1.2.1  
**Features:** Word-level timestamps, speaker diarization, VAD

**No persistent server** - invoke via Python script or CLI.

#### CLI Usage (SSH/Remote):
```bash
# Basic transcription
whisperx audio.mp3 --model large-v3 --device cuda

# With speaker diarization (requires HuggingFace token)
whisperx audio.mp3 --model large-v3 --diarize --hf_token YOUR_TOKEN

# Output formats
whisperx audio.mp3 --model large-v3 --output_format srt
whisperx audio.mp3 --model large-v3 --output_format json
```

#### Python API:
```python
import whisperx

device = "cuda"
audio_file = "audio.mp3"

# Load model
model = whisperx.load_model("large-v3", device, compute_type="float16")

# Transcribe
audio = whisperx.load_audio(audio_file)
result = model.transcribe(audio, batch_size=16)

# Align whisper output (word-level timestamps)
model_a, metadata = whisperx.load_align_model(language_code=result["language"], device=device)
result = whisperx.align(result["segments"], model_a, metadata, audio, device, return_char_alignments=False)

print(result["segments"])
```

---

### 2. OpenAI Whisper (Original)

**Package:** `openai-whisper` v20250625  
**Models:** tiny, base, small, medium, large, large-v2, large-v3

#### CLI Usage:
```bash
# Basic transcription
whisper audio.mp3 --model large-v3 --device cuda

# With language hint
whisper audio.mp3 --model large-v3 --language en

# Output formats
whisper audio.mp3 --model large-v3 --output_format srt
whisper audio.mp3 --model large-v3 --output_format json --output_dir ./output
```

#### Python API:
```python
import whisper

model = whisper.load_model("large-v3", device="cuda")
result = model.transcribe("audio.mp3")

print(result["text"])
for segment in result["segments"]:
    print(f"[{segment['start']:.2f} - {segment['end']:.2f}] {segment['text']}")
```

---

### 3. Faster-Whisper (Optimized)

**Package:** `faster-whisper` v1.2.1  
**Backend:** CTranslate2 (4x faster than original Whisper)

#### Python API:
```python
from faster_whisper import WhisperModel

model = WhisperModel("large-v3", device="cuda", compute_type="float16")

segments, info = model.transcribe("audio.mp3", beam_size=5)

print(f"Detected language: {info.language} (probability: {info.language_probability:.2f})")
for segment in segments:
    print(f"[{segment.start:.2f}s -> {segment.end:.2f}s] {segment.text}")
```

---

### 4. Superwhisper (Desktop App)

**Application:** `Superwhisper.exe`  
**Location:** `C:\Users\Content Proof\AppData\Local\superwhisper\`  
**Status:** Running as desktop app

GUI-based transcription tool. Not API-accessible - for local manual use only.

---

### 5. YouTube Transcript API

**Package:** `youtube-transcript-api` v1.2.4  
**Use case:** Fetch existing YouTube captions (no transcription needed)

#### Python API:
```python
from youtube_transcript_api import YouTubeTranscriptApi

# Get transcript by video ID
transcript = YouTubeTranscriptApi.get_transcript("VIDEO_ID")

for entry in transcript:
    print(f"[{entry['start']:.2f}s] {entry['text']}")

# Get transcript in specific language
transcript = YouTubeTranscriptApi.get_transcript("VIDEO_ID", languages=['en', 'es'])
```

---

## Setting Up a Whisper HTTP Server

To expose WhisperX as an HTTP API for remote agents:

### Option 1: Simple Flask Server

Create `C:\whisper-server\whisperx-server.py`:

```python
"""
WhisperX HTTP Server
Port: 9000
"""
import os
import tempfile
from flask import Flask, request, jsonify
import whisperx

app = Flask(__name__)

# Load model on startup
device = "cuda"
model = None

def get_model():
    global model
    if model is None:
        print("Loading WhisperX model...")
        model = whisperx.load_model("large-v3", device, compute_type="float16")
        print("Model loaded!")
    return model

@app.route("/health", methods=["GET"])
def health():
    return jsonify({"status": "ok", "model": "whisperx-large-v3"})

@app.route("/transcribe", methods=["POST"])
def transcribe():
    if "file" not in request.files:
        return jsonify({"error": "No file provided"}), 400
    
    file = request.files["file"]
    
    # Save to temp file
    with tempfile.NamedTemporaryFile(delete=False, suffix=".wav") as tmp:
        file.save(tmp.name)
        tmp_path = tmp.name
    
    try:
        m = get_model()
        audio = whisperx.load_audio(tmp_path)
        result = m.transcribe(audio, batch_size=16)
        
        # Optional: align for word-level timestamps
        # model_a, metadata = whisperx.load_align_model(language_code=result["language"], device=device)
        # result = whisperx.align(result["segments"], model_a, metadata, audio, device)
        
        return jsonify({
            "text": " ".join([s["text"] for s in result["segments"]]),
            "segments": result["segments"],
            "language": result.get("language", "unknown")
        })
    finally:
        os.unlink(tmp_path)

if __name__ == "__main__":
    app.run(host="0.0.0.0", port=9000)
```

### Start the server:
```powershell
cd C:\whisper-server
python whisperx-server.py
```

### Access from other machines:
```bash
# Health check
curl http://100.67.12.59:9000/health

# Transcribe audio file
curl -X POST http://100.67.12.59:9000/transcribe \
  -F "file=@audio.mp3"
```

---

## Quick Reference: Remote Access

| Service | Port | URL | Status |
|---------|------|-----|--------|
| WhisperX Server | 9000 | `http://100.67.12.59:9000` | ✅ Running |
| SenseVoice Server | 9001 | `http://100.67.12.59:9001` | ✅ Running |
| Piper TTS | 3456 | `http://100.67.12.59:3456` | ✅ Running |
| Qwen3 TTS | 3457 | `http://100.67.12.59:3457` | ✅ Running |
| Llama Server | 8888 | `http://100.67.12.59:8888` | ✅ Running |

---

## Model Recommendations

| Use Case | Model | Speed | Quality |
|----------|-------|-------|---------|
| Quick drafts | `base` | ⚡⚡⚡⚡ | ⭐⭐ |
| General use | `medium` | ⚡⚡⚡ | ⭐⭐⭐ |
| High accuracy | `large-v3` | ⚡⚡ | ⭐⭐⭐⭐⭐ |
| Diarization | WhisperX + `large-v3` | ⚡ | ⭐⭐⭐⭐⭐ |

---

## Notes

- **GPU Memory:** large-v3 uses ~5-6GB VRAM. Can run alongside LLM server.
- **First run:** Models download on first use (~3GB for large-v3).
- **Diarization:** Requires HuggingFace token for pyannote models.
- **Formats supported:** mp3, wav, m4a, flac, ogg, webm

---

*Last updated: March 17, 2026*
