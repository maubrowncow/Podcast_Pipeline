"""
WhisperX HTTP Server
Provides transcription API via HTTP for remote agents.

Port: 9000 (configurable via PORT env var)
Endpoint: POST /transcribe - upload audio file, get transcription
"""
import os
os.environ["PATH"] = r"C:\ffmpeg\bin;" + os.environ.get("PATH", "")

import tempfile
import time
from flask import Flask, request, jsonify, send_file
import whisperx
import torch

app = Flask(__name__)
PORT = int(os.environ.get("PORT", 9000))

# Global model
model = None
align_model = None
align_metadata = None
device = "cuda" if torch.cuda.is_available() else "cpu"

def get_model():
    global model
    if model is None:
        print(f"Loading WhisperX model on {device}...")
        model = whisperx.load_model("large-v3", device, compute_type="float16" if device == "cuda" else "int8")
        print("Model loaded!")
    return model

@app.route("/health", methods=["GET"])
def health():
    return jsonify({
        "status": "ok", 
        "model": "whisperx-large-v3",
        "device": device,
        "gpu": torch.cuda.get_device_name(0) if torch.cuda.is_available() else None
    })

@app.route("/transcribe", methods=["POST"])
def transcribe():
    """
    Transcribe an audio file.
    
    Form data:
    - file: Audio file (required)
    - align: "true" to get word-level timestamps (optional, default false)
    - language: Language code hint (optional, auto-detected)
    
    Returns JSON with text, segments, and language.
    """
    if "file" not in request.files:
        return jsonify({"error": "No file provided. Use multipart/form-data with 'file' field."}), 400
    
    file = request.files["file"]
    do_align = request.form.get("align", "false").lower() == "true"
    language = request.form.get("language", None)
    
    # Save to temp file
    suffix = os.path.splitext(file.filename)[1] or ".wav"
    with tempfile.NamedTemporaryFile(delete=False, suffix=suffix) as tmp:
        file.save(tmp.name)
        tmp_path = tmp.name
    
    try:
        start = time.time()
        m = get_model()
        
        # Load and transcribe
        audio = whisperx.load_audio(tmp_path)
        result = m.transcribe(audio, batch_size=16, language=language)
        
        # Optional alignment for word-level timestamps
        if do_align:
            global align_model, align_metadata
            lang = result.get("language", "en")
            if align_model is None or align_metadata.get("language") != lang:
                align_model, align_metadata = whisperx.load_align_model(language_code=lang, device=device)
                align_metadata["language"] = lang
            result = whisperx.align(result["segments"], align_model, align_metadata, audio, device, return_char_alignments=False)
        
        elapsed = time.time() - start
        duration = len(audio) / 16000  # whisperx uses 16kHz
        
        return jsonify({
            "text": " ".join([s["text"].strip() for s in result["segments"]]),
            "segments": result["segments"],
            "language": result.get("language", "unknown"),
            "duration_seconds": round(duration, 2),
            "processing_seconds": round(elapsed, 2),
            "realtime_factor": round(elapsed / duration, 2) if duration > 0 else None
        })
    except Exception as e:
        return jsonify({"error": str(e)}), 500
    finally:
        os.unlink(tmp_path)

@app.route("/models", methods=["GET"])
def models():
    """List available models."""
    return jsonify({
        "available": ["tiny", "base", "small", "medium", "large-v2", "large-v3"],
        "loaded": "large-v3" if model else None,
        "device": device
    })

if __name__ == "__main__":
    print(f"Starting WhisperX server on port {PORT}...")
    print(f"Device: {device}")
    if torch.cuda.is_available():
        print(f"GPU: {torch.cuda.get_device_name(0)}")
    app.run(host="0.0.0.0", port=PORT, threaded=False)
