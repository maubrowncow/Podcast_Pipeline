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
from flask import Flask, request, jsonify
import whisperx
import torch

app = Flask(__name__)
PORT = int(os.environ.get("PORT", 9000))

# Global models
models = {}  # model_name -> model
align_model = None
align_metadata = None
diarize_model = None
device = "cuda" if torch.cuda.is_available() else "cpu"


def get_model(model_name="small"):
    global models
    if model_name not in models:
        print(f"Loading WhisperX model '{model_name}' on {device}...")
        models[model_name] = whisperx.load_model(
            model_name,
            device,
            compute_type="float16" if device == "cuda" else "int8"
        )
        print(f"Model '{model_name}' loaded!")
    return models[model_name]


def get_diarize_model(hf_token):
    global diarize_model
    if diarize_model is None:
        print("Loading diarization pipeline...")
        from whisperx.diarize import DiarizationPipeline
        diarize_model = DiarizationPipeline(token=hf_token, device=device)
        print("Diarization pipeline loaded!")
    return diarize_model


@app.route("/health", methods=["GET"])
def health():
    return jsonify({
        "status": "ok",
        "model": "whisperx (dynamic)",
        "loaded_models": list(models.keys()),
        "device": device,
        "gpu": torch.cuda.get_device_name(0) if torch.cuda.is_available() else None,
        "diarization": "available",
    })


@app.route("/transcribe", methods=["POST"])
def transcribe():
    """
    Transcribe an audio file.

    Form data:
    - file: Audio file (required)
    - model: Model name (optional, default "small") - tiny/base/small/medium/large-v2/large-v3
    - align: "true" to get word-level timestamps (optional, default false)
    - diarize: "true" to identify speakers (optional, default false)
    - hf_token: HuggingFace token for diarization (required if diarize=true)
    - language: Language code hint (optional, auto-detected)

    Returns JSON with text, segments (with speaker labels if diarized), and language.
    """
    if "file" not in request.files:
        return jsonify({"error": "No file provided. Use multipart/form-data with 'file' field."}), 400

    file = request.files["file"]
    model_name = request.form.get("model", "small")
    do_align = request.form.get("align", "false").lower() == "true"
    do_diarize = request.form.get("diarize", "false").lower() == "true"
    hf_token = request.form.get("hf_token", os.environ.get("HF_TOKEN", ""))
    language = request.form.get("language", None)
    num_speakers_raw = request.form.get("num_speakers", None)
    num_speakers = int(num_speakers_raw) if num_speakers_raw else None

    if do_diarize and not hf_token:
        return jsonify({"error": "hf_token is required for diarization. Pass it as form data or set HF_TOKEN env var."}), 400

    suffix = os.path.splitext(file.filename)[1] or ".wav"
    with tempfile.NamedTemporaryFile(delete=False, suffix=suffix) as tmp:
        file.save(tmp.name)
        tmp_path = tmp.name

    try:
        start = time.time()
        m = get_model(model_name)

        # Load and transcribe
        audio = whisperx.load_audio(tmp_path)
        result = m.transcribe(audio, batch_size=16, language=language)

        # Optional alignment for word-level timestamps
        if do_align or do_diarize:
            global align_model, align_metadata
            lang = result.get("language", "en")
            if align_model is None or align_metadata.get("language") != lang:
                align_model, align_metadata = whisperx.load_align_model(language_code=lang, device=device)
                align_metadata["language"] = lang
            result = whisperx.align(result["segments"], align_model, align_metadata, audio, device, return_char_alignments=False)

        # Optional speaker diarization
        if do_diarize:
            dm = get_diarize_model(hf_token)
            diarize_segments = dm(audio, num_speakers=num_speakers)
            result = whisperx.assign_word_speakers(diarize_segments, result, fill_nearest=True)

        elapsed = time.time() - start
        duration = len(audio) / 16000  # whisperx uses 16kHz

        return jsonify({
            "text": " ".join([s["text"].strip() for s in result["segments"]]),
            "segments": result["segments"],
            "language": result.get("language", "unknown"),
            "model": model_name,
            "duration_seconds": round(duration, 2),
            "processing_seconds": round(elapsed, 2),
            "realtime_factor": round(elapsed / duration, 2) if duration > 0 else None,
            "diarized": do_diarize,
        })
    except Exception as e:
        import traceback
        traceback.print_exc()
        return jsonify({"error": str(e)}), 500
    finally:
        os.unlink(tmp_path)


@app.route("/models", methods=["GET"])
def list_models():
    """List available models."""
    return jsonify({
        "available": ["tiny", "base", "small", "medium", "large-v2", "large-v3"],
        "loaded": list(models.keys()),
        "device": device,
        "diarization_loaded": diarize_model is not None,
    })


if __name__ == "__main__":
    print(f"Starting WhisperX server on port {PORT}...")
    print(f"Device: {device}")
    if torch.cuda.is_available():
        print(f"GPU: {torch.cuda.get_device_name(0)}")
    app.run(host="0.0.0.0", port=PORT, threaded=False)
