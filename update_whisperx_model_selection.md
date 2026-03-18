# Update WhisperX Server — Dynamic Model Selection

Update the WhisperX Flask server at `C:\whisper-server\whisperx-server.py` to accept a `model` parameter on the `/transcribe` endpoint, allowing the caller to choose which Whisper model to use per request.

---

## What to change

The `/transcribe` endpoint should accept a new form field:

- `model`: Model name (e.g., `tiny`, `base`, `small`, `medium`, `large-v2`, `large-v3`). Default: `small`

When the requested model differs from the currently loaded model, unload the old one and load the new one.

### Key changes to the transcribe function:

```python
# Add to the /transcribe endpoint, after parsing form data:
requested_model = request.form.get("model", "small")

# Update get_model() to accept a model name and reload if different:
def get_model(model_name="small"):
    global model, current_model_name
    if model is None or current_model_name != model_name:
        if model is not None:
            print(f"Unloading model {current_model_name}, loading {model_name}...")
            del model
            import gc
            gc.collect()
            if torch.cuda.is_available():
                torch.cuda.empty_cache()
        print(f"Loading WhisperX model '{model_name}' on {device}...")
        model = whisperx.load_model(model_name, device, compute_type="float16" if device == "cuda" else "int8")
        current_model_name = model_name
        print(f"Model '{model_name}' loaded!")
    return model
```

### Global variables to add at the top:

```python
current_model_name = None
```

### Also reset alignment model when the base model changes:

When the model changes, the alignment model's language cache may be stale. Reset `align_model` and `align_metadata` to `None` when swapping models so they get reloaded for the new model's detected language.

---

## Full updated `/transcribe` endpoint

```python
@app.route("/transcribe", methods=["POST"])
def transcribe():
    if "file" not in request.files:
        return jsonify({"error": "No file provided."}), 400

    file = request.files["file"]
    do_align = request.form.get("align", "false").lower() == "true"
    do_diarize = request.form.get("diarize", "false").lower() == "true"
    hf_token = request.form.get("hf_token", os.environ.get("HF_TOKEN", ""))
    language = request.form.get("language", None)
    requested_model = request.form.get("model", "small")

    if do_diarize and not hf_token:
        return jsonify({"error": "hf_token is required for diarization."}), 400

    suffix = os.path.splitext(file.filename)[1] or ".wav"
    with tempfile.NamedTemporaryFile(delete=False, suffix=suffix) as tmp:
        file.save(tmp.name)
        tmp_path = tmp.name

    try:
        start = time.time()
        m = get_model(requested_model)

        audio = whisperx.load_audio(tmp_path)
        result = m.transcribe(audio, batch_size=16, language=language)

        if do_align or do_diarize:
            global align_model, align_metadata
            lang = result.get("language", "en")
            if align_model is None or align_metadata.get("language") != lang:
                align_model, align_metadata = whisperx.load_align_model(language_code=lang, device=device)
                align_metadata["language"] = lang
            result = whisperx.align(result["segments"], align_model, align_metadata, audio, device, return_char_alignments=False)

        if do_diarize:
            dm = get_diarize_model(hf_token)
            diarize_segments = dm(audio)
            result = whisperx.assign_word_speakers(diarize_segments, result)

        elapsed = time.time() - start
        duration = len(audio) / 16000

        return jsonify({
            "text": " ".join([s["text"].strip() for s in result["segments"]]),
            "segments": result["segments"],
            "language": result.get("language", "unknown"),
            "duration_seconds": round(duration, 2),
            "processing_seconds": round(elapsed, 2),
            "realtime_factor": round(elapsed / duration, 2) if duration > 0 else None,
            "diarized": do_diarize,
            "model": requested_model,
        })
    except Exception as e:
        import traceback
        traceback.print_exc()
        return jsonify({"error": str(e)}), 500
    finally:
        os.unlink(tmp_path)
```

---

## After updating, restart the server

```powershell
cd C:\whisper-server
python whisperx-server.py
```

The first request with a new model will take extra time to download and load it.

---

*Created: March 17, 2026*
